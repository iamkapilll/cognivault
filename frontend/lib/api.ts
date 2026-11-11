export const API_BASE = "/backend";

export type ApiDocument = {
  id: number;
  filename: string;
  status: string;
  page_count: number | null;
  extraction_method: string | null;
  document_type: string | null;
  review_status: string;
  index_status: string;
  created_at: string;
};

export type DocumentText = ApiDocument & {
  extracted_text: string | null;
};

export type DocumentAnalysis = ApiDocument & {
  extracted_fields: Record<string, unknown>;
};

export type RagSource = {
  document_id: number;
  filename: string;
  chunk_index: number;
  content: string;
  distance: number;
};

export type RagAnswer = {
  answer: string;
  sources: RagSource[];
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function notifyUnauthorized() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cognivault:unauthorized"));
  }
}

async function parseError(response: Response): Promise<never> {
  const body = await response.json().catch(() => null);

  const detail =
    typeof body?.detail === "string"
      ? body.detail
      : response.status === 401
        ? "Your session expired. Please sign in again."
        : `Request failed (${response.status})`;

  if (response.status === 401) {
    notifyUnauthorized();
  }

  throw new ApiError(detail, response.status);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    return parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getDocuments(params?: {
  q?: string;
  status?: string;
}): Promise<ApiDocument[]> {
  const search = new URLSearchParams();

  if (params?.q) search.set("q", params.q);
  if (params?.status) search.set("status", params.status);

  const suffix = search.size ? `?${search.toString()}` : "";

  return request<ApiDocument[]>(`/documents${suffix}`);
}

export function getDocument(id: number): Promise<ApiDocument> {
  return request<ApiDocument>(`/documents/${id}`);
}

export function getDocumentText(id: number): Promise<DocumentText> {
  return request<DocumentText>(`/documents/${id}/text`);
}

export function getDocumentAnalysis(id: number): Promise<DocumentAnalysis> {
  return request<DocumentAnalysis>(`/documents/${id}/analysis`);
}

export function indexDocument(
  id: number,
): Promise<{ chunks_created: number; message: string }> {
  return request(`/rag/index/${id}`, { method: "POST" });
}

export function deleteDocument(id: number): Promise<{ message: string }> {
  return request(`/documents/${id}`, { method: "DELETE" });
}

export function askDocuments(
  question: string,
  documentIds: number[],
  topK = 4,
): Promise<RagAnswer> {
  return request<RagAnswer>("/rag/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      document_ids: documentIds.length ? documentIds : null,
      top_k: topK,
    }),
  });
}

export function uploadDocumentWithProgress(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<ApiDocument> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/documents/upload`);
    xhr.withCredentials = true;
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(xhr.response as ApiDocument);
        return;
      }

      if (xhr.status === 401) {
        notifyUnauthorized();
      }

      const detail =
        typeof xhr.response?.detail === "string"
          ? xhr.response.detail
          : `Upload failed (${xhr.status})`;

      reject(new ApiError(detail, xhr.status));
    };

    xhr.onerror = () => reject(new ApiError("Network error during upload", 0));
    xhr.onabort = () => reject(new ApiError("Upload cancelled", 0));

    xhr.send(form);
  });
}

export function getHealth(): Promise<{ status: string }> {
  return request<{ status: string }>("/health");
}
