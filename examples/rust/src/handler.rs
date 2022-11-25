use hyper::{
    Body, Request, Response, StatusCode,
};

pub fn MyHandler(_req: Request<Body>) -> Response<Body> {
    Response::builder()
        .status(StatusCode::OK)
        .body(Body::from("Ferris says hello!"))
        .unwrap()
}
