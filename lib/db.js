'use strict';

const _ = require('lodash');
const mysql = require('mysql');
const Promise = require('bluebird');
const error = require('./error');

Promise.promisifyAll(mysql);
Promise.promisifyAll(require('mysql/lib/Connection').prototype);

let db;

const Db = module.exports;

const defaultLimit = 1000;

Db.init = (dbc) => {
  db = dbc;
  return db.connectAsync();
};

Db.connect = env =>
  Db.init(mysql.createConnection({
    host: env.RDS_HOST,
    user: env.RDS_USER,
    password: env.RDS_PASSWORD,
    database: env.RDS_DATABASE,
    ssl: env.RDS_SSL,
    port: env.RDS_PORT,
    // debug: ['ComQueryPacket'],
  }))
;

Db.getConnection = () => db;

Db.checkAppNotExists = id =>
  db.queryAsync('SELECT COUNT(*) as c FROM apps WHERE id = ?', [id])
    .spread((res) => {
      if (res.c !== 0) {
        throw error.badRequest('Already exists');
      }
    })
    .then(() => true);

Db.checkAppAccess = (id, vendor) =>
  db.queryAsync('SELECT COUNT(*) as c FROM apps WHERE id = ? AND vendor = ?', [id, vendor])
    .spread((res) => {
      if (res.c === 0) {
        throw error.notFound();
      }
    })
    .then(() => true);

Db.checkAppExists = id =>
  db.queryAsync('SELECT COUNT(*) as c FROM apps WHERE id = ?', [id])
    .spread((res) => {
      if (res.c === 0) {
        throw error.notFound();
      }
    })
    .then(() => true);

Db.checkVendorExists = vendor =>
  db.queryAsync('SELECT COUNT(*) as c FROM vendors WHERE id = ?', [vendor])
    .spread((res) => {
      if (res.c === 0) {
        throw error.badRequest(`Vendor ${vendor} does not exist`);
      }
    })
    .then(() => true);

Db.checkVendorNotExists = vendor =>
  db.queryAsync('SELECT COUNT(*) as c FROM vendors WHERE id = ?', [vendor])
    .spread((res) => {
      if (res.c !== 0) {
        throw error.badRequest(`Vendor ${vendor} already exists`);
      }
    })
    .then(() => true);

Db.insertApp = (paramsIn) => {
  let params;
  return Db.formatAppInput(paramsIn)
    .then((paramsOut) => {
      params = paramsOut;
    })
    .then(() => db.queryAsync('INSERT INTO apps SET ?', params))
    .then(() => {
      delete params.vendor;
      return db.queryAsync('INSERT INTO appVersions SET ?', params);
    });
};

Db.copyAppToVersion = (id, userEmail) =>
  db.queryAsync('SELECT * FROM apps WHERE id = ?', [id])
    .spread((res) => {
      const result = res;
      if (!result) {
        throw error.notFound(`App ${id} does not exist`);
      } else {
        delete result.vendor;
        delete result.createdOn;
        delete result.createdBy;
        return result;
      }
    })
    .then((appIn) => {
      const app = appIn;
      app.createdBy = userEmail;
      return db.queryAsync('INSERT INTO appVersions SET ?', app);
    });

Db.updateApp = (paramsIn, id, userEmail) => {
  let params;
  return Db.formatAppInput(paramsIn)
    .then((paramsOut) => {
      params = paramsOut;
    })
    .then(() => {
      if (_.size(params)) {
        return db.beginTransactionAsync()
          .then(() => db.queryAsync(
            'UPDATE apps SET ?, version = version + 1 WHERE id = ?',
            [params, id]
          ))
          .then(() => Db.copyAppToVersion(id, userEmail))
          .then(() => db.commitAsync());
      }
    });
};

Db.addAppIcon = (id) => {
  let version;
  return db.beginTransactionAsync()
    .then(() => db.queryAsync(
      'UPDATE apps ' +
      'SET icon32 = CONCAT(?, version + 1, ?), icon64 = CONCAT(?, version + 1, ?), version = version + 1 ' +
      'WHERE id = ?',
      [`${id}/32/`, '.png', `${id}/64/`, '.png', id]
    ))
    .then(() => Db.copyAppToVersion(id, 'upload'))
    .then(() => db.queryAsync(
      'SELECT MAX(version) AS version FROM apps WHERE id = ?',
      [id]
    ))
    .spread((res) => {
      version = res.version;
      return db.commitAsync();
    })
    .then(() => version);
};


Db.listApps = (vendor = null, forPublic = false, offset = 0, limit = defaultLimit) => {
  let query = 'SELECT a.*, a.vendor as vendorId, v.name as vendorName, v.address as vendorAddress, v.email as vendorEmail ' +
    'FROM apps a ' +
    'LEFT JOIN vendors v ON (a.vendor = v.id) ' +
    'WHERE a.deletedOn IS NULL ';
  const params = [];
  if (vendor) {
    query += 'AND a.vendor=? ';
    params.push(vendor);
  }
  if (forPublic) {
    query += 'AND a.isPublic=1 ';
  }
  query += 'ORDER BY name LIMIT ? OFFSET ?;';
  params.push(limit ? _.toSafeInteger(limit) : defaultLimit);
  params.push(_.toSafeInteger(offset));
  return db.queryAsync(query, params)
    .then(res => res.map((appIn) => {
      let app = Db.formatAppOutput(appIn);
      if (forPublic) {
        app = Db.formatAppOutputForPublic(app);
      }
      return app;
    }));
};


Db.getApp = (id, version = null) => {
  if (version) {
    return Db.getAppVersion(id, version);
  }

  return db.queryAsync(
    'SELECT a.*, a.vendor as vendorId, v.name as vendorName, v.address as vendorAddress, v.email as vendorEmail ' +
    'FROM apps a ' +
    'LEFT JOIN vendors v ON (a.vendor = v.id) ' +
    'WHERE a.id = ?',
    [id],
  )
    .spread((res) => {
      if (!res) {
        if (version) {
          throw error.notFound(`Version ${version} of app ${id} does not exist`);
        }
        throw error.notFound(`App ${id} does not exist`);
      }
      return Db.formatAppOutput(res);
    });
};

Db.getAppVersion = (id, version) =>
  db.queryAsync(
    'SELECT a.*, ' +
    'ap.vendor as vendorId, v.name as vendorName, v.address as vendorAddress, v.email as vendorEmail ' +
    'FROM appVersions a ' +
    'LEFT JOIN apps ap ON (ap.id = a.id) ' +
    'LEFT JOIN vendors v ON (ap.vendor = v.id) ' +
    'WHERE a.id = ? AND a.version = ?',
    [id, version],
  )
    .spread((res) => {
      if (!res) {
        throw error.notFound();
      }
      return Db.formatAppOutput(res);
    })
;

Db.getAppWithVendor = function (id, version = null) {
  let sql;
  let params;
  if (version) {
    sql = 'SELECT a.id, ' +
      'ap.vendor as vendorId, v.name as vendorName, v.address as vendorAddress, v.email as vendorEmail, ' +
      'a.isPublic, a.createdOn, a.createdBy, a.deletedOn, ' +
      'a.isDeprecated, a.expiredOn, a.replacementApp, ' +
      'a.version, a.name, a.type, ' +
      'a.repoType, a.repoUri, a.repoTag, a.repoOptions, ' +
      'a.shortDescription, a.longDescription, a.licenseUrl, a.documentationUrl, ' +
      'a.requiredMemory, a.processTimeout, a.encryption, a.network, a.defaultBucket, a.defaultBucketStage, ' +
      'a.forwardToken, a.forwardTokenDetails, a.injectEnvironment, a.cpuShares, ' +
      'a.uiOptions, a.imageParameters, a.testConfiguration, a.configurationSchema, a.configurationDescription, ' +
      'a.configurationFormat, a.emptyConfiguration, a.actions, a.fees, a.limits, a.logger, a.loggerConfiguration, ' +
      'a.stagingStorageInput, a.icon32, a.icon64, a.legacyUri, a.permissions ' +
      'FROM appVersions AS a ' +
      'LEFT JOIN apps ap ON (ap.id = a.id) ' +
      'LEFT JOIN vendors v ON (ap.vendor = v.id) ' +
      'WHERE a.id=? AND a.version=?';
    params = [id, version];
  } else {
    sql = 'SELECT a.id, ' +
      'a.vendor as vendorId, v.name as vendorName, v.address as vendorAddress, v.email as vendorEmail, ' +
      'a.isPublic, a.createdOn, a.createdBy, a.deletedOn, ' +
      'a.isDeprecated, a.expiredOn, a.replacementApp, ' +
      'a.version, a.name, a.type, ' +
      'a.repoType, a.repoUri, a.repoTag, a.repoOptions, ' +
      'a.shortDescription, a.longDescription, a.licenseUrl, a.documentationUrl, ' +
      'a.requiredMemory, a.processTimeout, a.encryption, a.network, a.defaultBucket, a.defaultBucketStage, ' +
      'a.forwardToken, a.forwardTokenDetails, a.injectEnvironment, a.cpuShares, ' +
      'a.uiOptions, a.imageParameters, a.testConfiguration, a.configurationSchema, a.configurationDescription, ' +
      'a.configurationFormat, a.emptyConfiguration, a.actions, a.fees, a.limits, a.logger, a.loggerConfiguration, ' +
      'a.stagingStorageInput, a.icon32, a.icon64, a.legacyUri, a.permissions ' +
      'FROM apps AS a ' +
      'LEFT JOIN vendors v ON (a.vendor = v.id) ' +
      'WHERE a.id=?';
    params = [id];
  }

  return db.queryAsync(sql, params).spread((res) => {
    if (!res) {
      throw error.notFound(`App ${id} does not exist`);
    }
    return Db.formatAppOutput(res);
  });
};

Db.publicGetApp = id =>
  Db.getAppWithVendor(id)
    .then(data => Db.formatAppOutputForPublic(data))
;

Db.listVersions = (id, offset = 0, limit = defaultLimit) =>
  db.queryAsync(
    'SELECT a.*, ap.vendor as vendorId, v.name as vendorName, v.address as vendorAddress, v.email as vendorEmail ' +
    'FROM appVersions a ' +
    'LEFT JOIN apps ap ON (ap.id = a.id) ' +
    'LEFT JOIN vendors v ON (ap.vendor = v.id) ' +
    'WHERE a.id = ? ' +
    'ORDER BY a.createdOn LIMIT ? OFFSET ?;',
    [id, limit ? _.toSafeInteger(limit) : defaultLimit, _.toSafeInteger(offset)]
  )
    .then((res) => {
      res.map(Db.formatAppOutput);
      return res;
    });

Db.getLatestVersions = (since = null, until = null) => {
  const params = [];
  let query = 'SELECT * FROM appVersions WHERE createdOn >= ';
  if (since) {
    query += '? ';
    params.push(since);
  } else {
    query += 'SUBDATE(CURRENT_DATE, 1) ';
  }
  if (until) {
    query += 'AND createdOn <= ? ';
    params.push(until);
  }
  query += 'ORDER BY createdOn DESC;';
  return db.queryAsync(query, params);
};

Db.listStacks = () =>
  db.queryAsync(
    'SELECT name ' +
    'FROM stacks ' +
    'ORDER BY name;'
  ).then(res => res.map(r => r.name));


Db.end = () => db.endAsync()
  .catch(() => null);

Db.formatAppInput = (appIn, checkStacks = true) => {
  const app = _.clone(appIn);
  return new Promise((resolve) => {
    if (app.uiOptions) {
      app.uiOptions = JSON.stringify(app.uiOptions);
    }
    if (app.imageParameters) {
      app.imageParameters = JSON.stringify(app.imageParameters);
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
    resolve();
  })
    .then(() => {
      if (checkStacks) {
        return Db.listStacks();
      }
      return null;
    })
    .then((stacks) => {
      if (app.permissions) {
        _.each(app.permissions, (p) => {
          if (!_.includes(stacks, p.stack)) {
            throw error.unprocessable(`Stack ${p.stack} is not supported`);
          }
        });
        app.permissions = JSON.stringify(app.permissions);
      }
    })
    .then(() => {
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
        app.repoOptions = app.repository.options
          ? JSON.stringify(app.repository.options) : null;
      }
      delete app.repository;

      if (_.isObject(app.vendor)) {
        app.vendor = app.vendor.id;
      }

      const allowedKeys = ['id', 'vendor', 'isPublic', 'createdOn', 'createdBy', 'deletedOn',
        'isDeprecated', 'expiredOn', 'replacementApp', 'version', 'name', 'type', 'repoType',
        'repoUri', 'repoTag', 'repoOptions', 'shortDescription', 'longDescription',
        'licenseUrl', 'documentationUrl', 'requiredMemory', 'processTimeout', 'encryption',
        'network', 'defaultBucket', 'defaultBucketStage', 'forwardToken', 'forwardTokenDetails',
        'injectEnvironment', 'cpuShares', 'uiOptions', 'imageParameters', 'testConfiguration',
        'configurationSchema', 'configurationDescription', 'configurationFormat',
        'emptyConfiguration', 'actions', 'fees', 'limits', 'logger', 'loggerConfiguration',
        'stagingStorageInput', 'icon32', 'icon64', 'legacyUri', 'permissions'];
      _.each(app, (val, key) => {
        if (!_.includes(allowedKeys, key)) {
          delete app[key];
        }
      });

      return app;
    });
};

Db.formatAppOutput = (appIn) => {
  const app = appIn;
  app.uri = _.get(app, 'legacyUri', null) ?
    app.legacyUri : `docker/${app.id}`;
  delete app.legacyUri;

  if (_.has(app, 'encryption')) {
    app.encryption = app.encryption === 1;
  }
  if (_.has(app, 'isPublic')) {
    app.isPublic = app.isPublic === 1;
  }
  if (_.has(app, 'isDeprecated')) {
    app.isDeprecated = app.isDeprecated === 1;
  }
  if (_.has(app, 'defaultBucket')) {
    app.defaultBucket = app.defaultBucket === 1;
  }
  if (_.has(app, 'forwardToken')) {
    app.forwardToken = app.forwardToken === 1;
  }
  if (_.has(app, 'forwardTokenDetails')) {
    app.forwardTokenDetails = app.forwardTokenDetails === 1;
  }
  if (_.has(app, 'injectEnvironment')) {
    app.injectEnvironment = app.injectEnvironment === 1;
  }
  if (_.has(app, 'uiOptions')) {
    app.uiOptions = typeof app.uiOptions === 'string'
      ? JSON.parse(app.uiOptions) : app.uiOptions;
    if (!app.uiOptions) {
      app.uiOptions = [];
    }
  }
  if (_.has(app, 'imageParameters')) {
    app.imageParameters = typeof app.imageParameters === 'string'
      ? JSON.parse(app.imageParameters) : app.imageParameters;
  }
  if (_.has(app, 'testConfiguration')) {
    app.testConfiguration = typeof app.testConfiguration === 'string'
      ? JSON.parse(app.testConfiguration) : app.testConfiguration;
  }
  if (_.has(app, 'configurationSchema')) {
    app.configurationSchema = typeof app.configurationSchema === 'string'
      ? JSON.parse(app.configurationSchema) : app.configurationSchema;
  }
  if (_.has(app, 'emptyConfiguration')) {
    app.emptyConfiguration = typeof app.emptyConfiguration === 'string'
      ? JSON.parse(app.emptyConfiguration) : app.emptyConfiguration;
  }
  if (_.has(app, 'loggerConfiguration')) {
    app.loggerConfiguration = typeof app.loggerConfiguration === 'string'
      ? JSON.parse(app.loggerConfiguration) : app.loggerConfiguration;
  }
  if (_.has(app, 'permissions')) {
    app.permissions = typeof app.permissions === 'string'
      ? JSON.parse(app.permissions) : app.permissions;
    if (!app.permissions) {
      app.permissions = [];
    }
  }
  if (_.has(app, 'actions')) {
    app.actions = typeof app.actions === 'string'
      ? JSON.parse(app.actions) : app.actions;
    if (!app.actions) {
      app.actions = [];
    }
  }
  if (_.has(app, 'fees')) {
    app.fees = app.fees === 1;
  }
  if (_.has(app, 'vendorId') && _.has(app, 'vendorName')
    && _.has(app, 'vendorAddress') && _.has(app, 'vendorEmail')) {
    app.vendor = {
      id: app.vendorId,
      name: app.vendorName,
      address: app.vendorAddress,
      email: app.vendorEmail,
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
      options: app.repoOptions ? JSON.parse(app.repoOptions) : {},
    };
    delete app.repoType;
    delete app.repoUri;
    delete app.repoTag;
    delete app.repoOptions;
  }
  return app;
};

Db.formatAppOutputForPublic = (appIn) => {
  if (!appIn.isPublic) {
    throw error.notFound(`App ${appIn.id} does not exist`);
  }
  const app = appIn;
  delete app.createdOn;
  delete app.createdBy;
  delete app.deletedOn;
  delete app.permissions;
  return app;
};
