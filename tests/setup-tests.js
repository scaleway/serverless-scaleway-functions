'use strict';

const { afterAll, jest: requiredJest } = require('@jest/globals');
//const { removeAllTestProjects } = require('./utils/clean-up');

requiredJest.setTimeout(500000);
//afterAll(() => removeAllTestProjects()); // check globalTeardown
