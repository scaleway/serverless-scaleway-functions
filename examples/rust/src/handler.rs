use axum::{
    body::Body, extract::Request, response::Response,
};
use http::StatusCode;

pub async fn my_handler(_req: Request<Body>) -> Response<Body> {
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/plain")
        .body(Body::from("Ferris says hello!"))
        .unwrap()
}
