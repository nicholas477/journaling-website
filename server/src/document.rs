use axum::{
    Json,
    extract::{Extension, Path},
    http::StatusCode,
    response::Html,
};
use axum_routes::routes;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

#[cfg(test)]
mod tests;

#[derive(Clone)]
pub struct AppState {
    data_dir: PathBuf,
}

impl AppState {
    pub fn new(data_dir: impl Into<PathBuf>) -> Self {
        Self {
            data_dir: data_dir.into().join("documents"),
        }
    }
}

const HTML_CACHE_VERSION: u32 = 1;

#[routes]
pub enum DocumentRoutes {
    #[get("/", handler = list_documents)]
    ListDocuments,

    #[get("/{slug}/data", handler = get_document_data)]
    GetDocumentData,

    #[get("/{slug}/inner", handler = get_document_inner)]
    GetDocumentInner,

    #[delete("/{slug}", handler = delete_document)]
    DeleteDocument,

    #[post("/create", handler = create_document)]
    CreateDocument,
}

#[derive(Deserialize)]
struct CreateDocumentRequest {
    title: String,
    #[serde(default)]
    subtitle: String,
    slug: String,
    content: String,

    /// Hash of the generated HTML on the client side
    hash: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Document {
    title: String,
    subtitle: String,
    slug: String,
    created_at: String,
    updated_at: String,
    content: String,
    #[serde(skip)]
    content_hash: String,
    #[serde(skip)]
    html_hash: String,
    #[serde(skip)]
    cache_version: u32,
}

#[derive(Serialize, Deserialize)]
struct DocumentMetadata {
    title: String,
    #[serde(default)]
    subtitle: String,
    slug: String,
    created_at: String,
    updated_at: String,
    #[serde(default)]
    content_hash: String,
    #[serde(default)]
    html_hash: String,
    #[serde(default)]
    cache_version: u32,
}

type ApiError = (StatusCode, String);

fn document_dir(state: &AppState, slug: &str) -> Result<PathBuf, ApiError> {
    if slug.is_empty()
        || slug.len() > 80
        || !slug
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err((StatusCode::BAD_REQUEST, "Invalid document slug".into()));
    }
    Ok(state.data_dir.join(slug))
}

fn remove_document(state: &AppState, slug: &str) -> Result<(), ApiError> {
    let dir = document_dir(state, slug)?;
    std::fs::remove_dir_all(dir).map_err(|error| {
        let status = if error.kind() == std::io::ErrorKind::NotFound {
            StatusCode::NOT_FOUND
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        };
        (status, "Could not delete document".into())
    })
}

fn read_document(state: &AppState, slug: &str) -> Result<Document, ApiError> {
    let dir = document_dir(state, slug)?;
    let metadata_text = std::fs::read_to_string(dir.join("metadata.toml"))
        .map_err(|_| (StatusCode::NOT_FOUND, "Document not found".into()))?;
    let metadata: DocumentMetadata = toml::from_str(&metadata_text).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Invalid document metadata".into(),
        )
    })?;
    let content = std::fs::read_to_string(dir.join("content.md")).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Document content is missing".into(),
        )
    })?;
    Ok(Document {
        title: metadata.title,
        subtitle: metadata.subtitle,
        slug: metadata.slug,
        created_at: metadata.created_at,
        updated_at: metadata.updated_at,
        content,
        content_hash: metadata.content_hash,
        html_hash: metadata.html_hash,
        cache_version: metadata.cache_version,
    })
}

fn write_document(state: &AppState, document: &Document, html: &str) -> Result<(), ApiError> {
    let dir = document_dir(state, &document.slug)?;
    let metadata = toml::to_string(&DocumentMetadata {
        title: document.title.clone(),
        subtitle: document.subtitle.clone(),
        slug: document.slug.clone(),
        created_at: document.created_at.clone(),
        updated_at: document.updated_at.clone(),
        content_hash: document.content_hash.clone(),
        html_hash: document.html_hash.clone(),
        cache_version: document.cache_version,
    })
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not serialize document".into(),
        )
    })?;

    std::fs::create_dir_all(&dir).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not create document".into(),
        )
    })?;
    std::fs::write(dir.join("content.md"), &document.content).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not save document content".into(),
        )
    })?;
    std::fs::write(dir.join("content.html"), html).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not save rendered HTML".into(),
        )
    })?;
    std::fs::write(dir.join("metadata.toml"), metadata).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not save document metadata".into(),
        )
    })?;
    Ok(())
}

fn read_or_render_html(state: &AppState, slug: &str) -> Result<String, ApiError> {
    let mut document = read_document(state, slug)?;
    let dir = document_dir(state, slug)?;
    let source_hash = shared::hash(&document.content);

    if document.cache_version == HTML_CACHE_VERSION
        && document.content_hash == source_hash
        && let Ok(cached_html) = std::fs::read_to_string(dir.join("content.html"))
        && document.html_hash == shared::hash(&cached_html)
    {
        return Ok(cached_html);
    }

    let html = sanitize_html(&shared::markdown_to_html(&document.content));
    document.content_hash = source_hash;
    document.html_hash = shared::hash(&html);
    document.cache_version = HTML_CACHE_VERSION;
    write_document(state, &document, &html)?;
    Ok(html)
}

fn sanitize_html(html: &str) -> String {
    ammonia::clean(html)
}

fn now_rfc3339() -> Result<String, ApiError> {
    OffsetDateTime::now_utc().format(&Rfc3339).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not format timestamp".into(),
        )
    })
}

async fn get_document_data(
    Extension(state): Extension<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<Document>, ApiError> {
    read_document(&state, &slug).map(Json)
}

async fn get_document_inner(
    Extension(state): Extension<AppState>,
    Path(slug): Path<String>,
) -> Result<Html<String>, ApiError> {
    read_or_render_html(&state, &slug).map(Html)
}

async fn delete_document(
    Extension(state): Extension<AppState>,
    Path(slug): Path<String>,
) -> Result<StatusCode, ApiError> {
    remove_document(&state, &slug)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn create_document(
    Extension(state): Extension<AppState>,
    Json(payload): Json<CreateDocumentRequest>,
) -> Result<(StatusCode, Json<Document>), ApiError> {
    let slug = payload.slug.trim();
    let dir = document_dir(&state, slug)?;
    let title = payload.title.trim();
    if title.is_empty() || title.len() > 200 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Title must be 1 to 200 characters".into(),
        ));
    }
    let subtitle = payload.subtitle.trim();
    if subtitle.len() > 300 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Subtitle must be at most 300 characters".into(),
        ));
    }
    if payload.content.len() > 1_000_000 {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            "Document exceeds 1 MB".into(),
        ));
    }
    let rendered_html = shared::markdown_to_html(&payload.content);
    if shared::hash(&rendered_html) != payload.hash {
        return Err((
            StatusCode::BAD_REQUEST,
            "Preview hash does not match content".into(),
        ));
    }
    let html = sanitize_html(&rendered_html);
    let html_hash = shared::hash(&html);

    let existing = dir.exists();
    let created_at = if existing {
        read_document(&state, slug)?.created_at
    } else {
        now_rfc3339()?
    };
    let content_hash = shared::hash(&payload.content);
    let document = Document {
        title: title.to_owned(),
        subtitle: subtitle.to_owned(),
        slug: slug.to_owned(),
        created_at,
        updated_at: now_rfc3339()?,
        content: payload.content,
        content_hash,
        html_hash,
        cache_version: HTML_CACHE_VERSION,
    };
    write_document(&state, &document, &html)?;

    let status = if existing {
        StatusCode::OK
    } else {
        StatusCode::CREATED
    };
    Ok((status, Json(document)))
}

async fn list_documents(
    Extension(state): Extension<AppState>,
) -> Result<Json<Vec<Document>>, ApiError> {
    let mut documents = Vec::new();
    let entries = std::fs::read_dir(&state.data_dir).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not read documents".into(),
        )
    })?;

    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if let Ok(document) = read_document(&state, &name) {
            documents.push(document);
        }
    }

    documents.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(Json(documents))
}
