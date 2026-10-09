use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn markdown_to_html(markdown: &str) -> String {
    shared::markdown_to_html(markdown)
}

#[wasm_bindgen]
pub fn hash(input: &str) -> String {
    shared::hash(input)
}
