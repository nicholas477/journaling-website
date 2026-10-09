use axum::Extension;
use axum::Router;
use axum::routing::get_service;
use axum_routes::routes;
use std::net::SocketAddr;
use tower_http::services::{ServeDir, ServeFile};

pub mod document;

#[derive(serde::Serialize, serde::Deserialize)]
struct Config {
    address: String,
    port: u16,
    data_dir: String,
}

#[routes]
enum Routes {
    #[nest("/documents")]
    Nested(document::DocumentRoutes),
}

#[tokio::main]
async fn main() {
    // Load configuration from the "config.toml" file.
    let config: Config = toml::from_str(&std::fs::read_to_string("config.toml").unwrap()).unwrap();

    std::fs::create_dir_all(&config.data_dir).unwrap();
    std::fs::create_dir_all(format!("{}/documents", config.data_dir)).unwrap();

    let serve_dir = ServeDir::new("static")
        .not_found_service(ServeFile::new("static/index.html"));

    let router = axum_routes::router!(self::Routes)
        .layer(Extension(document::AppState::new(config.data_dir.clone())));

    let app = Router::new()
        .merge(router)
        .route("/documents/{slug}", get_service(ServeFile::new("static/index.html")))
        .route(
            "/documents/{slug}/update",
            get_service(ServeFile::new("static/index.html")),
        )
        .route(
            "/documents/create",
            get_service(ServeFile::new("static/index.html")),
        )
        .fallback_service(serve_dir);

    let addr = SocketAddr::from((
        config.address.parse::<std::net::IpAddr>().unwrap(),
        config.port,
    ));

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    println!("Serving static site on http://{}", addr);

    axum::serve(listener, app).await.unwrap();
}
