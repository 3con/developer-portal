'use script';

const async = require('async');
const awsSetup = require('./aws-setup');
const yaml = require('yamljs');

const env = yaml.load('../env.yml');

async.waterfall([
  (cb) => {
    awsSetup.saveAccountId(cb);
  },
  (cb) => {
    awsSetup.deleteCognitoPool(
      env.REGION,
      env.COGNITO_POOL_ID,
      cb
    );
  },
  (cb) => {
    awsSetup.deleteRds(
      env.REGION,
      env.RDS_DATABASE,
      cb
    );
  },
], (err) => {
  if (err) {
    console.error(err);
  }
  process.exit();
});
