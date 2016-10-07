'use strict';
var _ = require('lodash');
var async = require('async');
var mysql = require('mysql');
var db;

var Db = module.exports;

Db.formatAppInput = function(app) {
  if (app.uiOptions) {
    app.uiOptions = JSON.stringify(app.uiOptions);
  }
  if (app.testConfiguration) {
    app.testConfiguration = JSON.stringify(app.testConfiguration);
  }
  if (app.configurationSchema) {
    app.configurationSchema = JSON.stringify(app.configurationSchema);
  }
  if (app.actions) {
    app.actions = JSON.stringify(app.actions);
  }
  if (app.emptyConfiguration) {
    app.emptyConfiguration = JSON.stringify(app.emptyConfiguration);
  }
  if (app.loggerConfiguration) {
    app.loggerConfiguration = JSON.stringify(app.loggerConfiguration);
  }

  if (_.has(app, 'repository.type')) {
    app.repoType = _.get(app, 'repository.type');
  }
  if (_.has(app, 'repository.uri')) {
    app.repoUri = _.get(app, 'repository.uri');
  }
  if (_.has(app, 'repository.tag')) {
    app.repoTag = _.get(app, 'repository.tag');
  }
  if (_.has(app, 'repository.options')) {
    app.repoOptions = app.repository.options ? JSON.stringify(app.repository.options) : null;
  }
  delete app.repository;

  return app;
};

Db.formatAppOutput = function(app) {

  app.uri = _.get(app, 'legacyUri', null) ? app.legacyUri : 'https://syrup.keboola.com/docker/' + app.id;
  delete app.legacyUri;

  if (app.hasOwnProperty('encryption')) {
    app.encryption = app.encryption === 1;
  }
  if (app.hasOwnProperty('isVisible')) {
    app.isVisible = app.isVisible === 1;
  }
  if (app.hasOwnProperty('defaultBucket')) {
    app.defaultBucket = app.defaultBucket === 1;
  }
  if (app.hasOwnProperty('forwardToken')) {
    app.forwardToken = app.forwardToken === 1;
  }
  if (app.hasOwnProperty('uiOptions')) {
    app.uiOptions = typeof app.uiOptions === 'string' ? JSON.parse(app.uiOptions) : app.uiOptions;
    if (!app.uiOptions) {
      app.uiOptions = [];
    }
  }
  if (app.hasOwnProperty('testConfiguration')) {
    app.testConfiguration = typeof app.testConfiguration === 'string'
      ? JSON.parse(app.testConfiguration) : app.testConfiguration;
  }
  if (app.hasOwnProperty('configurationSchema')) {
    app.configurationSchema = typeof app.configurationSchema === 'string'
      ? JSON.parse(app.configurationSchema) : app.configurationSchema;
  }
  if (app.hasOwnProperty('emptyConfiguration')) {
    app.emptyConfiguration = typeof app.emptyConfiguration === 'string'
      ? JSON.parse(app.emptyConfiguration) : app.emptyConfiguration;
  }
  if (app.hasOwnProperty('loggerConfiguration')) {
    app.loggerConfiguration = typeof app.loggerConfiguration === 'string'
      ? JSON.parse(app.loggerConfiguration) : app.loggerConfiguration;
  }
  if (app.hasOwnProperty('actions')) {
    app.actions = typeof app.actions === 'string' ? JSON.parse(app.actions) : app.actions;
    if (!app.actions) {
      app.actions = [];
    }
  }
  if (app.hasOwnProperty('fees')) {
    app.fees = app.fees === 1;
  }
  if (app.hasOwnProperty('isApproved')) {
    app.isApproved = app.isApproved === 1;
  }
  if (app.hasOwnProperty('vendorId') && app.hasOwnProperty('vendorName') && app.hasOwnProperty('vendorAddress')
    && app.hasOwnProperty('vendorEmail')) {
    app.vendor = {
      id: app.vendorId,
      name: app.vendorName,
      address: app.vendorAddress,
      email: app.vendorEmail
    };
    delete app.vendorId;
    delete app.vendorName;
    delete app.vendorAddress;
    delete app.vendorEmail;
  }
  if (_.has(app, 'repoType')) {
    app.repository = {
      type: _.get(app, 'repoType'),
      uri: _.get(app, 'repoUri'),
      tag: _.get(app, 'repoTag'),
      options: app.repoOptions ? JSON.parse(app.repoOptions) : {}
    };
    delete app.repoType;
    delete app.repoUri;
    delete app.repoTag;
    delete app.repoOptions;
  }
  return app;
};

Db.db = function() {
  return db;
};

Db.connect = function(params) {
  db = mysql.createConnection(params);
};

Db.end = function() {
  db.destroy();
};

Db.checkAppNotExists = function(id, callback) {
  db.query('SELECT COUNT(*) as c FROM apps WHERE id = ?', [id], function(err, result) {
    if (err) {
      return callback(err);
    }

    if (result[0]['c'] !== 0) {
      return callback(Error('[400] Already exists'));
    }

    return callback();
  });
};

Db.checkAppAccess = function(id, vendor, callback) {
  db.query('SELECT COUNT(*) as c FROM apps WHERE id = ? AND vendor = ?', [id, vendor], function(err, result) {
    if (err) {
      return callback(err);
    }

    if (result[0]['c'] === 0) {
      return callback(Error('[404] Not Found'));
    }

    return callback();
  });
};

Db.insertApp = function(params, callbackMain) {
  params = Db.formatAppInput(params);
  async.waterfall([
    function(callback) {
      db.query('INSERT INTO apps SET ?', params, function (err) {
        return callback(err);
      });
    },
    function(callback) {
      delete params.vendor;
      db.query('INSERT INTO appVersions SET ?', params, function (err) {
        return callback(err);
      });
    }
  ], callbackMain);
};

Db.copyAppToVersion = function(id, user, callbackMain) {
  async.waterfall([
    function(callback) {
      db.query('SELECT * FROM apps WHERE id = ?', [id], function(err, result) {
        if (err) {
          return callback(err);
        }

        if (result.length === 0) {
          return callback(Error('[404] App ' + id + ' does not exist'));
        }

        delete result[0].vendor;
        delete result[0].isApproved;
        delete result[0].createdOn;
        delete result[0].createdBy;

        return callback(null, result[0]);
      });
    },
    function(app, callback) {
      app.createdBy = user;
      db.query('INSERT INTO appVersions SET ?', app, function(err) {
        return callback(err, app.version);
      });
    }
  ], callbackMain);
};

Db.updateApp = function(params, id, user, callbackMain) {
  params = Db.formatAppInput(params);

  async.waterfall([
    function(callback) {
      db.query('UPDATE apps SET ?, version = version + 1 WHERE id = ?', [params, id], function(err) {
        callback(err);
      });
    },
    function(callback) {
      Db.copyAppToVersion(id, user, callback);
    }
  ], callbackMain);
};

Db.addAppIcon = function(id, size, callbackMain) {
  async.waterfall([
    function(callback) {
      db.query(
        'UPDATE apps SET ' +
        '?? = CONCAT(?, version + 1, ?), version = version + 1 ' +
        'WHERE id = ?', ['icon'+size, id+'/'+size+'/', '.png', id], function(err) {
        return callback(err);
      });
    },
    function(callback) {
      Db.copyAppToVersion(id, 'upload', callback);
    }
  ], callbackMain);
};

Db.getApp = function(id, version, callback) {
  async.waterfall([
    function(callbackLocal) {
      if (version) {
        db.query('SELECT * FROM appVersions WHERE id = ? AND version = ?', [id, version], function(err, res) {
          callbackLocal(err, res);
        });
      } else {
        db.query('SELECT * FROM apps WHERE id = ?', [id], function(err, res) {
          callbackLocal(err, res);
        });
      }
    },
    function(data, callbackLocal) {
      if (data.length === 0) {
        return callback(Error('[404] Not Found'));
      }

      return callbackLocal(null, Db.formatAppOutput(data[0]));
    }
  ], callback);
};

Db.listAppsForVendor = function(vendor, offset, limit, callback) {
  offset = offset ? _.toSafeInteger(offset) : 0;
  limit = limit ? _.toSafeInteger(limit) : 100;
  db.query(
    'SELECT id, version, name, type, createdOn, createdBy, isApproved, legacyUri ' +
    'FROM apps ' +
    'WHERE vendor = ?' +
    'ORDER BY name LIMIT ? OFFSET ?;', [vendor, limit, offset], function(err, res) {
      if (err) {
        callback(err);
      }
      res.map(function(app) {
        app.isApproved = app.isApproved === 1;
      });
      callback(null, res);
    });
};

Db.listVersions = function(id, offset, limit, callback) {
  offset = offset ? _.toSafeInteger(offset) : 0;
  limit = limit ? _.toSafeInteger(limit) : 100;
  db.query(
    'SELECT * ' +
    'FROM appVersions ' +
    'WHERE id = ? ' +
    'ORDER BY createdOn LIMIT ? OFFSET ?;', [id, limit, offset], function(err, res) {
      if (err) return callback(err);
      res.map(Db.formatAppOutput);
      return callback(null, res);
  });
};

Db.getPublishedApp = function(id, version, callback) {
  if (version) {
    db.query(
      'SELECT a.id, a.name, ap.vendor as vendorId, v.name as vendorName, v.address as vendorAddress, ' +
      'v.email as vendorEmail, a.version, a.type, a.repoType, a.repoOptions, a.repoUri, a.repoTag, ' +
      'a.shortDescription, a.longDescription, a.licenseUrl, a.documentationUrl, a.requiredMemory, a.processTimeout,' +
      'a.encryption, a.defaultBucket, a.defaultBucketStage, a.forwardToken, a.uiOptions, a.testConfiguration, ' +
      'a.configurationSchema, a.configurationDescription, a.emptyConfiguration, ' +
      'a.actions, a.fees, a.limits, a.logger, a.loggerConfiguration, a.icon32, a.icon64, ap.legacyUri ' +
      'FROM appVersions AS a ' +
      'LEFT JOIN apps ap ON (ap.id = a.id) ' +
      'LEFT JOIN vendors v ON (ap.vendor = v.id) ' +
      'WHERE a.id=? AND a.version=? AND ap.isApproved=1;', [id, version], function(err, result) {
        if (err) return callback(err);
        if (result.length === 0) {
          return callback(Error('[404] Not Found'));
        }
        return callback(err, Db.formatAppOutput(result[0]));
      });
  } else {
    db.query(
      'SELECT a.id, a.name, a.vendor as vendorId, v.name as vendorName, v.address as vendorAddress, ' +
      'v.email as vendorEmail, a.version, a.type, a.repoType, a.repoOptions, a.repoUri, a.repoTag, ' +
      'a.shortDescription, a.longDescription, a.licenseUrl, a.documentationUrl, a.requiredMemory, a.processTimeout,' +
      'a.encryption, a.defaultBucket, a.defaultBucketStage, a.forwardToken, a.uiOptions, a.testConfiguration, ' +
      'a.configurationSchema, a.configurationDescription, a.emptyConfiguration, ' +
      'a.actions, a.fees, a.limits, a.logger, a.loggerConfiguration, a.icon32, a.icon64, a.legacyUri ' +
      'FROM apps AS a ' +
      'LEFT JOIN vendors v ON (a.vendor = v.id) ' +
      'WHERE a.id=? AND a.isApproved=1;', id, function(err, result) {
        if (err) return callback(err);
        if (result.length === 0) {
          return callback(Error('[404] Not Found'));
        }
        return callback(err, Db.formatAppOutput(result[0]));
      });
  }

};

Db.listAllPublishedApps = function(offset, limit, callback) {
  offset = offset ? _.toSafeInteger(offset) : 0;
  limit = limit ? _.toSafeInteger(limit) : 100;
  db.query('SELECT id, vendor, name, version, type, shortDescription, icon32, icon64, legacyUri ' +
    'FROM apps ' +
    'WHERE isApproved=1 AND isVisible=1 ' +
    'ORDER BY id LIMIT ? OFFSET ?;', [limit, offset], function(err, res) {
    if (err) return callback(err);
    res.map(Db.formatAppOutput);
    return callback(err, res);
  });
};

Db.listPublishedAppVersions = function(id, offset, limit, callback) {
  offset = offset ? _.toSafeInteger(offset) : 0;
  limit = limit ? _.toSafeInteger(limit) : 100;
  db.query(
    'SELECT a.id, a.name, ap.vendor as vendorId, v.name as vendorName, v.address as vendorAddress, ' +
    'v.email as vendorEmail, a.version, a.type, a.repoType, a.repoOptions, a.repoUri, a.repoTag, ' +
    'a.shortDescription, a.longDescription, a.licenseUrl, a.documentationUrl, a.requiredMemory, a.processTimeout,' +
    'a.encryption, a.defaultBucket, a.defaultBucketStage, a.forwardToken, a.uiOptions, a.testConfiguration, ' +
    'a.configurationSchema, a.configurationDescription, a.emptyConfiguration, ' +
    'a.actions, a.fees, a.limits, a.logger, a.loggerConfiguration, a.icon32, a.icon64, ap.legacyUri ' +
    'FROM appVersions a ' +
    'LEFT JOIN apps ap ON (ap.id = a.id) ' +
    'LEFT JOIN vendors v ON (ap.vendor = v.id) ' +
    'WHERE a.id=? AND ap.isApproved=1 ' +
    'ORDER BY a.createdOn LIMIT ? OFFSET ?;', [id, limit, offset], function(err, res) {
      if (err) return callback(err);
      res.map(Db.formatAppOutput);
      return callback(null, res);
    });
};

Db.listVendors = function(offset, limit, callback) {
  offset = offset ? _.toSafeInteger(offset) : 0;
  limit = limit ? _.toSafeInteger(limit) : 100;
  db.query(
    'SELECT id, name, address, email ' +
    'FROM vendors ' +
    'ORDER BY id LIMIT ? OFFSET ?;', [limit, offset], callback);
};

Db.getVendor = function(id, callback) {
  db.query('SELECT id, name, address, email FROM vendors WHERE id = ?', [id], function(err, res) {
    if (err) {
      return callback(err);
    }
    if (res.length === 0) {
      return callback(Error('[404] Not Found'));
    }
    return callback(err, res[0]);
  });
};

Db.listApps = function(filter, offset, limit, callback) {
  offset = offset ? _.toSafeInteger(offset) : 0;
  limit = limit ? _.toSafeInteger(limit) : 100;
  var filterSql = '';
  if (filter == 'unapproved') {
    filterSql = 'WHERE isApproved=0 ';
  }

  db.query(
    'SELECT id, version, name, type, createdOn, createdBy, isApproved, legacyUri ' +
    'FROM apps ' + filterSql +
    'ORDER BY name LIMIT ? OFFSET ?;', [limit, offset], function(err, res) {
      if (err) {
        callback(err);
      }
      res.map(function(app) {
        app.isApproved = app.isApproved === 1;
      });
      callback(null, res);
    });
};