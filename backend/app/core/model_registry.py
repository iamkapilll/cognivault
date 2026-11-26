"""Typed allowlist and lazy LangChain chat-model construction."""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Literal, cast

from langchain_core.language_models.chat_models import BaseChatModel

from app.core.config import settings

ModelProvider = Literal["groq", "openai", "anthropic", "google"]
ProviderName = ModelProvider
CredentialSetting = Literal[
    "groq_api_key",
    "openai_api_key",
    "anthropic_api_key",
    "google_api_key",
]


class ModelRegistryError(ValueError):
    """Base error for invalid or unavailable server model configuration."""


class UnknownModelProviderError(ModelRegistryError):
    """The requested provider is not supported by the server."""


class UnsupportedModelError(ModelRegistryError):
    """The requested model is not enabled for the provider."""


class MissingProviderCredentialsError(ModelRegistryError):
    """The server has no credential configured for the selected provider."""


class UnsupportedTemperatureError(ModelRegistryError):
    """The requested temperature is unsupported by the selected model."""


class ToolCallingUnsupportedError(ModelRegistryError):
    """The selected model cannot safely participate in a tool-calling graph."""


class ProviderIntegrationUnavailableError(ModelRegistryError):
    """The selected optional LangChain provider package is not installed."""


class ModelInitializationError(ModelRegistryError):
    """Provider client construction failed without exposing vendor details."""


@dataclass(frozen=True)
class ModelCapabilities:
    """Capabilities relied upon by the shared LangGraph agent runtime."""

    temperature_range: tuple[float, float]
    supports_tool_calling: bool


ModelBuilder = Callable[[str, str, float, float | None], BaseChatModel]


@dataclass(frozen=True)
class ProviderDefinition:
    """Server-owned provider metadata and a lazily importing constructor."""

    credential_setting: CredentialSetting
    models: Mapping[str, ModelCapabilities]
    build_model: ModelBuilder


def _build_groq(
    api_key: str,
    model_name: str,
    temperature: float,
    request_timeout: float | None,
) -> BaseChatModel:
    from langchain_groq import ChatGroq

    options = {
        "api_key": api_key,
        "model": model_name,
        "temperature": temperature,
        "max_tokens": 1000,
        "streaming": True,
    }
    if request_timeout is not None:
        options["request_timeout"] = request_timeout
    return ChatGroq(**options)


def _build_openai(
    api_key: str,
    model_name: str,
    temperature: float,
    request_timeout: float | None,
) -> BaseChatModel:
    from langchain_openai import ChatOpenAI

    options = {
        "api_key": api_key,
        "model": model_name,
        "temperature": temperature,
        "max_tokens": 1000,
        "streaming": True,
    }
    if request_timeout is not None:
        options["request_timeout"] = request_timeout
    return ChatOpenAI(**options)


def _build_anthropic(
    api_key: str,
    model_name: str,
    temperature: float,
    request_timeout: float | None,
) -> BaseChatModel:
    from langchain_anthropic import ChatAnthropic

    options = {
        "api_key": api_key,
        "model": model_name,
        "temperature": temperature,
        "max_tokens": 1000,
        "streaming": True,
    }
    if request_timeout is not None:
        options["default_request_timeout"] = request_timeout
    return ChatAnthropic(**options)


def _build_google(
    api_key: str,
    model_name: str,
    temperature: float,
    request_timeout: float | None,
) -> BaseChatModel:
    from langchain_google_genai import ChatGoogleGenerativeAI

    options = {
        "api_key": api_key,
        "model": model_name,
        "temperature": temperature,
        "max_output_tokens": 1000,
        "streaming": True,
    }
    if request_timeout is not None:
        options["timeout"] = request_timeout
    return ChatGoogleGenerativeAI(**options)


_TOOL_CAPABLE = ModelCapabilities(
    temperature_range=(0.0, 2.0),
    supports_tool_calling=True,
)

MODEL_REGISTRY: Mapping[ModelProvider, ProviderDefinition] = {
    "groq": ProviderDefinition(
        credential_setting="groq_api_key",
        models={
            "openai/gpt-oss-20b": _TOOL_CAPABLE,
            "openai/gpt-oss-120b": _TOOL_CAPABLE,
            "llama-3.3-70b-versatile": _TOOL_CAPABLE,
            "llama-3.1-8b-instant": _TOOL_CAPABLE,
        },
        build_model=_build_groq,
    ),
    "openai": ProviderDefinition(
        credential_setting="openai_api_key",
        models={"gpt-5.6-sol": _TOOL_CAPABLE},
        build_model=_build_openai,
    ),
    "anthropic": ProviderDefinition(
        credential_setting="anthropic_api_key",
        models={
            # Haiku 4.5 is still active and accepts sampling temperature when
            # extended thinking is disabled (the ChatAnthropic default).
            "claude-haiku-4-5-20251001": ModelCapabilities(
                temperature_range=(0.0, 1.0),
                supports_tool_calling=True,
            ),
        },
        build_model=_build_anthropic,
    ),
    "google": ProviderDefinition(
        credential_setting="google_api_key",
        models={"gemini-4-hydrogen": _TOOL_CAPABLE},
        build_model=_build_google,
    ),
}

DEFAULT_AGENT_PROVIDER: ModelProvider = "groq"
DEFAULT_AGENT_MODEL = settings.groq_model
SUPPORTED_AGENT_MODELS: Mapping[ModelProvider, frozenset[str]] = {
    provider: frozenset(definition.models)
    for provider, definition in MODEL_REGISTRY.items()
}


def get_provider_definition(provider: str) -> ProviderDefinition:
    """Resolve an exact allowlisted provider name, never a dynamic import path."""

    if provider not in MODEL_REGISTRY:
        raise UnknownModelProviderError("Unsupported model provider.")
    return MODEL_REGISTRY[cast(ModelProvider, provider)]


def validate_model_configuration(
    provider: str,
    model_name: str,
    *,
    temperature: float | None = None,
    require_tool_calling: bool = False,
    require_credentials: bool = True,
) -> ModelCapabilities:
    """Validate provider, model, credentials, and requested runtime features."""

    definition = get_provider_definition(provider)
    capabilities = definition.models.get(model_name)
    if capabilities is None:
        raise UnsupportedModelError("The selected model is not enabled.")

    if temperature is not None:
        if (
            isinstance(temperature, bool)
            or not isinstance(temperature, (int, float))
            or not math.isfinite(float(temperature))
        ):
            raise UnsupportedTemperatureError("Invalid model temperature.")

        minimum, maximum = capabilities.temperature_range
        if not minimum <= float(temperature) <= maximum:
            raise UnsupportedTemperatureError(
                "Temperature is outside the supported range for this model."
            )

    if require_tool_calling and not capabilities.supports_tool_calling:
        raise ToolCallingUnsupportedError(
            "The selected model does not support tool calling."
        )

    if require_credentials:
        api_key = getattr(settings, definition.credential_setting)
        if not isinstance(api_key, str) or not api_key.strip():
            raise MissingProviderCredentialsError(
                f"{provider.capitalize()} is not configured on this server."
            )

    return capabilities


def create_chat_model(
    provider: str,
    model_name: str,
    temperature: float,
    *,
    require_tool_calling: bool = False,
    request_timeout: float | None = None,
) -> BaseChatModel:
    """Create an allowlisted LangChain chat model using server credentials.

    Integrations are imported only after the provider is selected, so optional
    credentials and packages for other providers do not affect application start.
    """

    validate_model_configuration(
        provider,
        model_name,
        temperature=temperature,
        require_tool_calling=require_tool_calling,
    )
    definition = get_provider_definition(provider)
    api_key: str = getattr(settings, definition.credential_setting).strip()

    try:
        return definition.build_model(
            api_key,
            model_name,
            float(temperature),
            request_timeout,
        )
    except ImportError:
        raise ProviderIntegrationUnavailableError(
            f"The {provider.capitalize()} LangChain integration is not installed."
        ) from None
    except Exception:  # noqa: BLE001 - sanitize provider constructor details
        # Provider client exceptions may contain request details. Do not chain
        # them into API-visible errors or logs where credentials could leak.
        raise ModelInitializationError(
            f"Could not initialize the selected {provider.capitalize()} model."
        ) from None
