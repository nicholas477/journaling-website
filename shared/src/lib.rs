use pulldown_cmark::{Options, Parser, html};
use sha2::{Digest, Sha256};

pub fn markdown_to_html(markdown: &str) -> String {
    let parser = Parser::new_ext(markdown, Options::all());
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

/// Generate a hash of a string
pub fn hash(input: &str) -> String {
    // Initialize the SHA-256 hasher
    let mut hasher = Sha256::new();

    hasher.update(input.as_bytes());
    let result = hasher.finalize().to_vec();

    // Convert the hash result to a hexadecimal string
    hex::encode(result)
}

#[cfg(test)]
mod tests {
    use super::markdown_to_html;

    #[test]
    fn renders_markdown() {
        assert_eq!(
            markdown_to_html("# Journal\n\nHello **world**."),
            "<h1>Journal</h1>\n<p>Hello <strong>world</strong>.</p>\n"
        );
    }

    #[test]
    fn preserves_markdown_extensions() {
        assert_eq!(
            markdown_to_html("~~removed~~"),
            "<p><del>removed</del></p>\n"
        );
        assert!(markdown_to_html("| Entry |\n| --- |\n| Today |").contains("<table>"));
    }
}
