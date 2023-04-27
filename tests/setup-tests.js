'use strict';

const { afterAll } = require('@jest/globals');
const { removeAllTestProjects } = require('./utils/clean-up');
jest.setTimeout(500000);

afterAll(() => removeAllTestProjects());
