'use strict';
var aws = require('aws-sdk');
var vandium = require('vandium');

vandium.validation({
  email: vandium.types.string().required().error(new Error('Parameter email is required')),
  body: vandium.types.object().keys({
    password: vandium.types.string().required().error(new Error('Parameter password is required')),
    code: vandium.types.string().required().error(new Error('Parameter code is required'))
  })
});

module.exports.handler = vandium(function(event, context, callback) {
  var provider = new aws.CognitoIdentityServiceProvider({region: process.env.REGION});
  provider.confirmForgotPassword({
    ClientId: process.env.COGNITO_CLIENT_ID,
    ConfirmationCode: event.body.code,
    Password: event.body.password,
    Username: event.email
  }, function(err) {
    return callback(err);
  });
});
