import re


def analyze_document(text: str) -> tuple[str, dict, str]:
    """
    Simple rule-based classification and field extraction.
    Results are candidates, not verified facts.
    """
    normalized = text.lower()

    if "invoice" in normalized:
        document_type = "invoice"
    elif "passport" in normalized or "citizenship" in normalized:
        document_type = "identity_document"
    elif "curriculum vitae" in normalized or "resume" in normalized:
        document_type = "resume"
    else:
        document_type = "general"

    fields = {}

    email_match = re.search(
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
        text,
    )

    if email_match:
        fields["email"] = email_match.group()

    if document_type == "invoice":
        invoice_match = re.search(
            r"invoice\s*(?:no\.?|number|#|:)\s*"
            r"([A-Za-z0-9/-]+)",
            text,
            re.IGNORECASE,
        )

        if invoice_match:
            fields["invoice_number"] = invoice_match.group(1)

    review_status = "needs_review"

    return document_type, fields, review_status
