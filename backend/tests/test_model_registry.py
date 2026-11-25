"""Provider registry configuration tests; model requests remain fully mocked."""

from __future__ import annotations

import sys
from types import ModuleType
from typing import Any

import pytest

from app.core import model_registry
from app.core.model_registry import (
    MissingProviderCredentialsError,
    ModelCapabilities,
    ModelInitializationError,
    ProviderDefinition,
    ToolCallingUnsupportedError,
    UnknownModelProviderError,
    UnsupportedModelError,
    UnsupportedTemperatureError,
    create_chat_model,
    validate_model_configuration,
)

PROVIDER_CASES = [
    (
        "groq",
        "langchain_groq",
        "ChatGroq",
        "groq_api_key",
        "openai/gpt-oss-20b",
        0.35,
        "max_tokens",
    ),
    (
        "openai",
        "langchain_openai",
        "ChatOpenAI",
        "openai_api_key",
        "gpt-5.6-sol",
        0.4,
        "max_tokens",
    ),
    (
        "anthropic",
        "langchain_anthropic",
        "ChatAnthropic",
        "anthropic_api_key",
        "claude-haiku-4-5-20251001",
        0.6,
        "max_tokens",
    ),
    (
        "google",
        "langchain_google_genai",
        "ChatGoogleGenerativeAI",
        "google_api_key",
        "gemini-4-hydrogen",
        0.7,
        "max_output_tokens",
    ),
]


@pytest.mark.parametrize(
    (
        "provider",
        "module_name",
        "class_name",
        "key_setting",
        "model_name",
        "temperature",
        "max_tokens_name",
    ),
    PROVIDER_CASES,
)
def test_registry_initializes_each_provider_with_its_server_configuration(
    monkeypatch: pytest.MonkeyPatch,
    provider: str,
    module_name: str,
    class_name: str,
    key_setting: str,
    model_name: str,
    temperature: float,
    max_tokens_name: str,
) -> None:
    secret = f"test-only-{provider}-credential"
    monkeypatch.setattr(model_registry.settings, key_setting, secret)
    captured: dict[str, Any] = {}
    module = ModuleType(module_name)

    def fake_provider_model(**parameters: Any) -> object:
        captured.update(parameters)
        return object()

    setattr(module, class_name, fake_provider_model)
    monkeypatch.setitem(sys.modules, module_name, module)

    instance = create_chat_model(
        provider,
        model_name,
        temperature,
        require_tool_calling=True,
    )

    assert instance is not None
    assert captured == {
        "api_key": secret,
        "model": model_name,
        "temperature": temperature,
        max_tokens_name: 1000,
        "streaming": True,
    }


@pytest.mark.parametrize(
    ("provider", "model_name", "key_setting"),
    [
        ("openai", "gpt-5.6-sol", "openai_api_key"),
        ("anthropic", "claude-haiku-4-5-20251001", "anthropic_api_key"),
        ("google", "gemini-4-hydrogen", "google_api_key"),
    ],
)
def test_additional_provider_credentials_are_optional_until_selected(
    monkeypatch: pytest.MonkeyPatch,
    provider: str,
    model_name: str,
    key_setting: str,
) -> None:
    monkeypatch.setattr(model_registry.settings, key_setting, " ")

    with pytest.raises(MissingProviderCredentialsError) as error:
        create_chat_model(provider, model_name, 0.2)

    assert provider.capitalize() in str(error.value)


def test_unknown_provider_is_rejected_without_dynamic_import() -> None:
    with pytest.raises(UnknownModelProviderError):
        validate_model_configuration("user.module.ChatModel", "model")


def test_unlisted_model_is_rejected() -> None:
    with pytest.raises(UnsupportedModelError):
        validate_model_configuration("openai", "gpt-6-unreviewed")


def test_anthropic_temperature_above_the_model_range_is_rejected() -> None:
    with pytest.raises(UnsupportedTemperatureError):
        validate_model_configuration(
            "anthropic",
            "claude-haiku-4-5-20251001",
            temperature=1.01,
        )


def test_temperature_outside_global_schema_range_is_rejected() -> None:
    with pytest.raises(UnsupportedTemperatureError):
        validate_model_configuration(
            "google",
            "gemini-4-hydrogen",
            temperature=2.01,
        )


def test_tool_calling_compatibility_is_enforced(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    providers = dict(model_registry.MODEL_REGISTRY)
    openai = providers["openai"]
    providers["openai"] = ProviderDefinition(
        credential_setting=openai.credential_setting,
        models={
            "gpt-5.6-sol": ModelCapabilities(
                temperature_range=(0.0, 2.0),
                supports_tool_calling=False,
            )
        },
        build_model=openai.build_model,
    )
    monkeypatch.setattr(model_registry, "MODEL_REGISTRY", providers)

    with pytest.raises(ToolCallingUnsupportedError):
        validate_model_configuration(
            "openai",
            "gpt-5.6-sol",
            temperature=0.2,
            require_tool_calling=True,
            require_credentials=False,
        )


def test_provider_initialization_errors_never_echo_api_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "must-not-appear-in-errors-or-logs"
    monkeypatch.setattr(model_registry.settings, "openai_api_key", secret)
    module = ModuleType("langchain_openai")

    def failing_provider_model(**_parameters: object) -> object:
        raise RuntimeError(f"request failed with authorization: {secret}")

    module.ChatOpenAI = failing_provider_model  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "langchain_openai", module)

    with pytest.raises(ModelInitializationError) as error:
        create_chat_model("openai", "gpt-5.6-sol", 0.2)

    assert secret not in str(error.value)
    assert error.value.__cause__ is None


def test_provider_api_keys_are_not_part_of_agent_responses() -> None:
    from app.schemas import AgentResponse

    assert not {
        "groq_api_key",
        "openai_api_key",
        "anthropic_api_key",
        "google_api_key",
    } & set(AgentResponse.model_fields)
