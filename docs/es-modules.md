# Node functions

Path to your handler file (from `serverless.yml`), omit `./`, `../`, and add the exported function to use as a handler:

```yml
- src
  - handlers
    - firstHandler.js  => module.exports.myFirstHandler = ...
    - secondHandler.js => module.exports.mySecondHandler = ...
- serverless.yml
```
In serverless.yml:
```yml
provider:
  # ...
  runtime: node16
functions:
  first:
    handler: src/handlers/firstHandler.myFirstHandler
  second:
    handler: src/handlers/secondHandler.mySecondHandler
```

Note: if you wish to use Typescript, you can do so by transpiling your code locally before deploying it. An example is
available [here](examples/typescript).

## ES modules

Node has two module systems:

- `CommonJS` - modules (default)
- `ECMAScript`/`ES` modules - gives a more modern way to reuse your code ([docs](https://nodejs.org/api/esm.html))

According to the official documentation, to use ES modules you can specify the module type in `package.json`, as in the following example:

```json
  ...
  "type": "module",
  ...
```

This then enables you to write your code for ES modules:

```javascript
export {handle};

function handle (event, context, cb) {
    return {
        body: process.version,
        headers: {"Content-Type": ["text/plain"]},
        statusCode: 200,
    };
};
```

The use of ES modules is encouraged since they are more efficient and make setup and debugging much easier.

Note that using `"type": "module"` or `"type": "commonjs"` in your `package.json` file will enable or disable some features in Node runtime, such as:
- `commonjs` is used as the default value
- `commonjs` allows you to use `require/module.exports` (synchronous code loading - it basically copies all file contents)
- `module` allows you to use `import/export` ES6 instructions (asynchronous loading - more optimized as it imports only the pieces of code you need)

>**Tip**:
For a comprehensive list of differences, please refer to the [Node.js official documentation](https://nodejs.org/api/esm.html).

