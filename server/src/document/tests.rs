use super::*;

fn temporary_state() -> AppState {
    let suffix = OffsetDateTime::now_utc().unix_timestamp_nanos();
    AppState::new(std::env::temp_dir().join(format!("stillnote-cache-{suffix}")))
}

#[test]
fn reuses_valid_html_cache_and_repairs_stale_or_missing_cache() {
    let state = temporary_state();
    let content = "# Cached note".to_owned();
    let cached_html = "<p>pre-rendered cache</p>\n";
    let document = Document {
        title: "Cache test".into(),
        subtitle: "Subtitle".into(),
        slug: "cache-test".into(),
        created_at: "2026-01-01T00:00:00Z".into(),
        updated_at: "2026-01-01T00:00:00Z".into(),
        content_hash: shared::hash(&content),
        html_hash: shared::hash(cached_html),
        cache_version: HTML_CACHE_VERSION,
        content,
    };
    write_document(&state, &document, cached_html).unwrap();

    assert_eq!(
        read_or_render_html(&state, "cache-test").unwrap(),
        cached_html
    );

    let dir = document_dir(&state, "cache-test").unwrap();
    std::fs::write(dir.join("content.html"), "corrupt cache").unwrap();
    let expected = shared::markdown_to_html("# Cached note");
    assert_eq!(read_or_render_html(&state, "cache-test").unwrap(), expected);

    std::fs::write(dir.join("content.md"), "# Changed source").unwrap();
    let expected = shared::markdown_to_html("# Changed source");
    assert_eq!(read_or_render_html(&state, "cache-test").unwrap(), expected);

    std::fs::remove_file(dir.join("content.html")).unwrap();
    assert_eq!(read_or_render_html(&state, "cache-test").unwrap(), expected);
    assert_eq!(
        std::fs::read_to_string(dir.join("content.html")).unwrap(),
        expected
    );
    std::fs::remove_dir_all(state.data_dir.parent().unwrap()).unwrap();
}

#[test]
fn sanitizes_unsafe_markdown_html_for_page_insertion() {
    let rendered = shared::markdown_to_html("<script>alert('xss')</script>\n\n# Safe content");
    let cleaned = sanitize_html(&rendered);

    assert!(!cleaned.contains("<script"));
    assert!(cleaned.contains("<h1>Safe content</h1>"));
}

#[test]
fn deletes_document_and_returns_not_found_when_missing() {
    let state = temporary_state();
    let document = Document {
        title: "Delete test".into(),
        subtitle: String::new(),
        slug: "delete-test".into(),
        created_at: "2026-01-01T00:00:00Z".into(),
        updated_at: "2026-01-01T00:00:00Z".into(),
        content: "# Delete test".into(),
        content_hash: String::new(),
        html_hash: String::new(),
        cache_version: HTML_CACHE_VERSION,
    };
    write_document(&state, &document, "<h1>Delete test</h1>").unwrap();

    remove_document(&state, "delete-test").unwrap();
    assert!(!document_dir(&state, "delete-test").unwrap().exists());
    assert_eq!(
        remove_document(&state, "delete-test").unwrap_err().0,
        StatusCode::NOT_FOUND
    );

    std::fs::remove_dir_all(state.data_dir.parent().unwrap()).unwrap();
}
