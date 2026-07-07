mod config;
mod routes;

use axum::Router;
use config::SyncServerConfig;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();
    let config = SyncServerConfig::from_env().await?;
    let app: Router = routes::router(config.clone());
    let listener = tokio::net::TcpListener::bind(config.bind_addr).await?;
    tracing::info!("GuYanTools sync server listening on {}", config.bind_addr);
    axum::serve(listener, app.into_make_service()).await?;
    Ok(())
}
