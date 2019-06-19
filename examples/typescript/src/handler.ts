import { APIGatewayProxyEvent, APIGatewayProxyResult, APIGatewayProxyHandler } from 'scaleway-functions-typescript';

const handler: APIGatewayProxyHandler = (event, context, callback) => {
  const result = {
    message: 'Hello from Node w/ TypeScript on Scaleway Functions !',
  };

  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
};

export default handler;
