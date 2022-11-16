use hyper::{
    Body, Request, Response, StatusCode,
};

pub fn handle(req: Request<Body>) -> Response<Body> {
    Response::builder()
        .status(StatusCode::OK)
        .body(Body::from("Ferris says hello!"))
        .unwrap()
}