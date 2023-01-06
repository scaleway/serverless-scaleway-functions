use hyper::{
    Body, Request, Response, StatusCode,
};

pub async fn MyHandler(_req: Request<Body>) -> Response<Body> {
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/plain")
        .body(Body::from("Ferris says hello!"))
        .unwrap()
}
