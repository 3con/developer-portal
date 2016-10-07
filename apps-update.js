'use strict';
var async = require('async');
var db = require('lib/db');
var identity = require('lib/identity');
var log = require('lib/log');
var vandium = require('vandium');
require('dotenv').config({silent: true});

module.exports.handler = vandium.createInstance({
  validation: {
    schema: {
      headers: vandium.types.object().keys({
        Authorization: vandium.types.string().required().error(Error('[422] Authorization header is required'))
      }),
      path: vandium.types.object().keys({
        appId: vandium.types.string().required()
      }),
      body: vandium.types.object().keys({
        name: vandium.types.string().max(128).error(Error('[422] Parameter name must be string and may have 128 characters at most')),
        type: vandium.types.string().valid('extractor', 'application', 'writer', 'other', 'transformation', 'processor')
          .error(Error('[422] Parameter type must be one of: extractor, application, writer, other, transformation, processor')),
        repository: vandium.types.object().keys({
          type: vandium.types.string().valid('dockerhub', 'quay').error(Error("[422] Parameter repository.type must be one of: dockerhub, quay")),
          uri: vandium.types.string().max(128).error(Error("[422] Parameter repository.uri must be uri and may have 128 characters at most")),
          tag: vandium.types.string().max(20).error(Error("[422] Parameter repository.tag must be string and may have 20 characters at most")),
          options: vandium.types.object().error(Error("[422] Parameter repository.options must be object"))
        }),
        shortDescription: vandium.types.string().error(Error('[422] Parameter shortDescription must be string')),
        longDescription: vandium.types.string().error(Error('[422] Parameter longDescription must be string')),
        licenseUrl: vandium.types.string().max(255).uri().error(Error("[422] Parameter licenseUrl must be url and may have 255 characters at most")),
        documentationUrl: vandium.types.string().max(255).uri().error(Error("[422] Parameter documentationUrl must be url and may have 255 characters at most")),
        encryption: vandium.types.boolean().error(Error('[422] Parameter encryption must be boolean')),
        defaultBucket: vandium.types.boolean().error(Error('[422] Parameter defaultBucket must be boolean')),
        defaultBucketStage: vandium.types.string().valid('in', 'out')
          .error(Error('[422] Parameter defaultBucketStage must be one of: in, out')),
        uiOptions: vandium.types.array().error(Error('[422] Parameter uiOptions must be array')),
        testConfiguration: vandium.types.object(),
        configurationSchema: vandium.types.object(),
        configurationDescription: vandium.types.string(),
        emptyConfiguration: vandium.types.object(),
        actions: vandium.types.array().error(Error('[422] Parameter actions must be array')),
        fees: vandium.types.boolean().error(Error('[422] Parameter fees must be boolean')),
        limits: vandium.types.string().error(Error('[422] Parameter limits must be string')),
        logger: vandium.types.string().valid('standard', 'gelf')
          .error(Error('[422] Parameter logger must be one of: standard, gelf')),
        loggerConfiguration: vandium.types.object(),
        isVisible: vandium.types.boolean().error(Error("[422] Parameter isVisible must be boolean")),
        id: vandium.types.any().forbidden().error(Error("[422] Setting of parameter id is forbidden")),
        vendor: vandium.types.any().forbidden().error(Error("[422] Setting of parameter vendor is forbidden")),
        isApproved: vandium.types.any().forbidden().error(Error("[422] Setting of parameter isApproved is forbidden")),
        createdOn: vandium.types.any().forbidden().error(Error("[422] Setting of parameter createdOn is forbidden")),
        createdBy: vandium.types.any().forbidden().error(Error("[422] Setting of parameter createdBy is forbidden")),
        version: vandium.types.any().forbidden().error(Error("[422] Setting of parameter version is forbidden")),
        forwardToken: vandium.types.any().forbidden().error(Error("[422] Setting of parameter forwardToken is forbidden")),
        requiredMemory: vandium.types.any().forbidden().error(Error("[422] Setting of parameter requiredMemory is forbidden")),
        processTimeout: vandium.types.any().forbidden().error(Error("[422] Setting of parameter processTimeout is forbidden")),
        icon32: vandium.types.any().forbidden().error(Error("[422] Setting of parameter icon32 is forbidden")),
        icon64: vandium.types.any().forbidden().error(Error("[422] Setting of parameter icon64 is forbidden")),
        legacyUri: vandium.types.any().forbidden().error(Error("[422] Setting of parameter legacyUri is forbidden"))
      })
    }
  }
}).handler(function(event, context, callback) {
  log.start('appsUpdate', event);
  db.connect({
    host: process.env.RDS_HOST,
    user: process.env.RDS_USER,
    password: process.env.RDS_PASSWORD,
    database: process.env.RDS_DATABASE,
    ssl: process.env.RDS_SSL
  });
  async.waterfall([
    function (callbackLocal) {
      identity.getUser(process.env.REGION, event.headers.Authorization, callbackLocal);
    },
    function (user, callbackLocal) {
      db.checkAppAccess(event.path.appId, user.vendor, function(err) {
        return callbackLocal(err, user);
      });
    },
    function(user, callbackLocal) {
      db.updateApp(event.body, event.path.appId, user.email, callbackLocal);
    }
  ], function(err) {
    db.end();
    return callback(err);
  });
});