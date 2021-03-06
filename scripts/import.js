'use strict';

const _ = require('lodash');
const async = require('async');
const db = require('../lib/db');
const exec = require('child_process').exec;
const fs = require('fs');
const mysql = require('mysql');
const request = require('request');

const rds = mysql.createConnection({
  host: process.env.RDS_HOST,
  port: process.env.RDS_PORT,
  user: process.env.RDS_USER,
  password: process.env.RDS_PASSWORD,
  database: process.env.RDS_DATABASE,
  ssl: process.env.RDS_SSL,
  multipleStatements: true,
});
db.connect(process.env);

const args = process.argv.slice(2);

const downloadIcon = function (uri, id, size, callback) {
  if (!fs.existsSync(`s3_bucket/icons/${id}`)) {
    fs.mkdirSync(`s3_bucket/icons/${id}`);
  }
  if (!fs.existsSync(`s3_bucket/icons/${id}/${size}`)) {
    fs.mkdirSync(`s3_bucket/icons/${id}/${size}`);
  }
  request({ uri })
    .pipe(fs.createWriteStream(`s3_bucket/icons/${id}/${size}/1.png`))
    .on('close', () => callback())
    .on('error', err => console.log(`Error downloading icon ${uri}' for app ${id}: ${err}`));
};

const getIcons = function (cb) {
  if (!fs.existsSync('s3_bucket')) {
    fs.mkdirSync('s3_bucket');
  }
  if (!fs.existsSync('s3_bucket/icons')) {
    fs.mkdirSync('s3_bucket/icons');
  }
  fs.readFile(args[1], 'utf8', (err, data) => {
    if (err) throw err;
    JSON.parse(data).components.forEach((app) => {
      if (app.ico32) {
        downloadIcon(app.ico32, app.id, 32, () => {
          //
        });
      } else {
        console.log(app.id, '32px Icon Missing');
      }
      if (app.ico64) {
        downloadIcon(app.ico64, app.id, 64, () => {
          //
        });
      } else {
        console.log(app.id, '64px Icon Missing');
      }
    });
    cb();
  });
};

let flags = [];
const types = [];

const getData = function (callbackMain) {
  fs.readFile(args[1], 'utf8', (err, data) => {
    if (err) {
      throw err;
    }

    const result = [];
    async.each(JSON.parse(data).components, (appIn, callback) => {
      const app = appIn;
      if (_.has(app, 'data.vendor.contact') && app.data.vendor.contact[0] !== 'todo' && app.data.vendor.contact[0] !== 'TODO') {
        if (_.startsWith(app.data.vendor.contact[0], 'Blue Sky')) {
          app.vendor = 'blueskydigital';
        } else if (_.startsWith(app.data.vendor.contact[0], 'S&G Consulting')) {
          app.vendor = 'sgconsulting';
        } else if (_.startsWith(app.data.vendor.contact[0], 'CleverAnalytics')) {
          app.vendor = 'cleveranalytics';
        } else if (_.startsWith(app.data.vendor.contact[0], 'DataBreakers')) {
          app.vendor = 'databreakers';
        } else if (_.startsWith(app.data.vendor.contact[0], 'datamind')) {
          app.vendor = 'datamind';
        } else if (_.startsWith(app.data.vendor.contact[0], 'Sun Marketing')) {
          app.vendor = 'sun';
        } else if (_.startsWith(app.data.vendor.contact[0], 'aLook')) {
          app.vendor = 'alook';
        } else if (_.startsWith(app.data.vendor.contact[0], 'Ecommerce')) {
          app.vendor = 'ech';
        } else if (_.startsWith(app.data.vendor.contact[0], 'David Esner')) {
          app.vendor = 'esnerda';
        } else if (_.startsWith(app.data.vendor.contact[0], 'Martin Fiser')) {
          app.vendor = 'fisa';
        } else if (_.startsWith(app.data.vendor.contact[0], 'Medio')) {
          app.vendor = 'medio';
        } else if (_.startsWith(app.data.vendor.contact[0], 'Keboola Singapore')) {
          app.vendor = 'vokurka';
        } else if (_.startsWith(app.data.vendor.contact[0], 'BizzTreat')) {
          app.vendor = 'bizztreat';
        } else if (_.startsWith(app.data.vendor.contact[0], 'GENEEA')) {
          app.vendor = 'geneea';
        } else if (_.startsWith(app.data.vendor.contact[0], 'Geneea')) {
          app.vendor = 'geneea';
        } else if (_.startsWith(app.data.vendor.contact[0], 'HTNS')) {
          app.vendor = 'htns';
        } else if (_.startsWith(app.data.vendor.contact[0], 'Pond5')) {
          app.vendor = 'pond5';
        } else if (_.startsWith(app.data.vendor.contact[0], 'Recombee')) {
          app.vendor = 'recombee';
        } else if (_.startsWith(app.data.vendor.contact[0], 'Vojtech Kurka')) {
          app.vendor = 'vokurka';
        } else if (_.startsWith(app.data.vendor.contact[0], 'Sormen Solutions')) {
          app.vendor = 'sormensolutions';
        } else if (_.startsWith(app.data.vendor.contact[0], 'StartupMetrics')) {
          app.vendor = 'startupmetrics';
        } else if (_.startsWith(app.data.vendor.contact[0], 'Tomáš Trnka')) {
          app.vendor = 'tomastrnka';
        } else if (_.startsWith(app.data.vendor.contact[0], 'TrendLucid')) {
          app.vendor = 'trendlucid';
        } else if (_.startsWith(app.id, 'keboola.')) {
          app.vendor = 'keboola';
        } else {
          app.vendor = '-unknown-';
        }
      } else if (_.startsWith(app.id, 'keboola.') || _.startsWith(app.id, 'ex-') || _.startsWith(app.id, 'wr-') || _.startsWith(app.id, 'ag-')
        || _.startsWith(app.id, 'orchestrator') || _.startsWith(app.id, 'pigeon') || _.startsWith(app.id, 'transformation')
        || _.startsWith(app.id, 'docker') || _.startsWith(app.id, 'dca') || _.startsWith(app.id, 'rcp')
        || _.startsWith(app.id, 'kbc-') || _.startsWith(app.id, 'lg-') || _.startsWith(app.id, 'rt-')
        || _.includes(['gooddata-writer', 'provisioning', 'queue', 'restbox', 'shiny', 'table-importer', 'tde-exporter'], app.id)) {
        app.vendor = 'keboola';
      } else if (_.startsWith(app.id, 'bcit.')) {
        app.vendor = 'bcit';
      } else if (_.startsWith(app.id, 'geneea-')) {
        app.vendor = 'geneea';
      } else if (_.startsWith(app.id, 'geneea.')) {
        app.vendor = 'geneea';
      } else if (_.startsWith(app.id, 'vokurka.')) {
        app.vendor = 'vokurka';
      } else if (_.startsWith(app.id, 'bcit.')) {
        app.vendor = 'bcit';
      } else if (_.startsWith(app.id, 'trologic.')) {
        app.vendor = 'trologic';
      } else {
        app.vendor = '-unknown-';
      }

      if (_.get(app, 'hasUI')) {
        app.flags.push('legacyAngularUI');
      }
      if (_.get(app, 'hasRun')) {
        app.flags.push('legacyHasRun');
      }

      if (_.has(app, 'data.definition.type')) {
        if (_.startsWith(app.data.definition.type, 'quay')) {
          app.repoType = 'quay';
        } else if (_.startsWith(app.data.definition.type, 'dockerhub')) {
          app.repoType = 'dockerhub';
        } else if (_.startsWith(app.data.definition.type, 'builder')) {
          app.repoType = 'builder';
        } else if (_.startsWith(app.data.definition.type, 'aws-ecr')) {
          app.repoType = 'ecr';
        } else {
          app.repoType = null;
        }
      }

      app.repoOptions = null;
      if (app.repoType === 'builder') {
        app.repoOptions = _.get(app, 'data.definition.build_options');
      }
      if (_.has(app, 'data.definition.repository.username') && _.has(app, 'data.definition.repository.#password')) {
        app.repoOptions = {
          username: app.data.definition.repository.username,
          '#password': app.data.definition.repository['#password'],
        };
      }

      if (!_.includes(types, app.type)) {
        types.push(app.type);
      }

      let legacyUri = null;
      if (app.uri !== `https://syrup.keboola.com/docker/${app.id}`) {
        legacyUri = app.uri;
        if (_.startsWith(app.uri, 'https://syrup.keboola.com/')) {
          legacyUri = app.uri.substr(26);
        }
      }

      const loggerConfiguration = {};
      if (_.has(app, 'data.logging.gelf_server_type')) {
        loggerConfiguration.transport = app.data.logging.gelf_server_type;
      }
      if (_.has(app, 'data.logging.verbosity')) {
        loggerConfiguration.verbosity = app.data.logging.verbosity;
      }

      _.forEach(app.data, (value, key) => {
        if (!_.includes(['logging', 'definition', 'vendor', 'memory', 'forward_token', 'default_bucket_stage', 'default_bucket', 'process_timeout', 'synchronous_actions', 'configuration_format', 'cpu_shares', 'forward_token_details', 'network', 'image_parameters', 'postProcess', 'modules', 'staging_storage', 'inject_environment'], key)) {
          console.log(`Left in data for app ${app.id}: ${key}`, value);
        }
      });
      _.forEach(app.data.definition, (value, key) => {
        if (!_.includes(['uri', 'tag', 'build_options', 'repository', 'type'], key)) {
          console.log(`Left in data.definition for app ${app.id}: ${key}`, value);
        }
      });

      let imageParameters = {};
      if (_.has(app, 'data.image_parameters')) {
        imageParameters = _.get(app, 'data.image_parameters', {});
      }
      if (_.has(app, 'data.modules')) {
        imageParameters.modules = app.data.modules;
      }
      if (_.has(app, 'data.postProcess')) {
        imageParameters.postProcess = app.data.postProcess;
      }

      flags = _.union(flags, app.flags);
      result.push({
        id: app.id,
        vendor: app.vendor,
        isPublic: !_.includes(app.flags, 'excludeFromNewList'),
        createdBy: 'support@keboola.com',
        version: 1,
        name: app.name,
        type: app.type,
        repository: {
          type: app.repoType,
          uri: _.get(app, 'data.definition.uri', null),
          tag: _.get(app, 'data.definition.tag', null),
          options: app.repoOptions,
        },
        shortDescription: app.description,
        longDescription: app.longDescription,
        licenseUrl: _.get(app, 'data.vendor.licenseUrl', null),
        documentationUrl: app.documentationUrl,
        requiredMemory: _.get(app, 'data.memory', null),
        processTimeout: _.get(app, 'data.process_timeout', null),
        encryption: _.includes(app.flags, 'encrypt'),
        network: _.get(app, 'data.network', 'bridge'),
        defaultBucket: _.get(app, 'data.default_bucket', false),
        defaultBucketStage: _.get(app, 'data.default_bucket_stage', null),
        forwardToken: _.get(app, 'data.forward_token', false),
        forwardTokenDetails: _.get(app, 'data.forward_token_details', false),
        injectEnvironment: _.get(app, 'data.inject_environment', false),
        cpuShares: _.get(app, 'data.cpu_shares', null),
        uiOptions: _.pull(app.flags, '3rdParty', 'encrypt', 'appInfo.fee', 'excludeFromNewList'),
        imageParameters,
        testConfiguration: {},
        configurationSchema: app.configurationSchema,
        configurationDescription: app.configurationDescription,
        configurationFormat: _.get(app, 'data.configuration_format', 'json'),
        emptyConfiguration: app.emptyConfiguration,
        actions: _.has(app, 'data.synchronous_actions') ? app.data.synchronous_actions : [],
        fees: _.includes(app.flags, 'appInfo.fee'),
        limits: null,
        logger: _.get(app, 'data.logging.type', 'standard'),
        loggerConfiguration,
        stagingStorageInput: _.get(app, 'data.stagingStorageInput', 'local'),
        icon32: app.ico32 ? `${app.id}/32/1.png` : null,
        icon64: app.ico64 ? `${app.id}/64/1.png` : null,
        legacyUri,
      });
      callback();
    }, err2 => callbackMain(err2, result));
  });
};

const saveData = function (data, callbackMain) {
  async.waterfall([
    function (cb) {
      rds.query('SET FOREIGN_KEY_CHECKS = 0;TRUNCATE TABLE appVersions;TRUNCATE TABLE apps;', err => cb(err));
    },
    function (cb) {
      async.each(data, (resApp, callback) => {
        db.formatAppInput(resApp)
          .then((dbApp) => {
            rds.query('INSERT IGNORE INTO apps SET ?', dbApp, (err) => {
              const dbAppVersion = _.cloneDeep(dbApp);
              if (err) {
                console.log(dbApp);
                throw err;
              }
              delete dbAppVersion.vendor;
              rds.query('INSERT IGNORE INTO appVersions SET ?', dbAppVersion, (err2) => {
                if (err2) {
                  console.log(resApp);
                  throw err2;
                }
                callback();
              });
            });
          });
      }, cb);
    },
  ], callbackMain);
};

const addNewData = function (data, callbackMain) {
  async.each(data, (resApp, callback) =>
    db.checkAppNotExists(resApp.id)
      .then(() => {
        console.log(`- Importing ${resApp.id}`);
        return db.insertApp(resApp);
      })
      .catch(() => {
        // exists, skip
      })
      .then(() => callback)
    , callbackMain);
};

if (args[0] === 'data') {
  getData((err, res) => {
    if (err) {
      throw err;
    }
    saveData(res, () => process.exit());
  });
} else if (args[0] === 'new-data') {
  getData((err, res) => {
    if (err) {
      throw err;
    }
    addNewData(res, () => process.exit());
  });
} else if (args[0] === 'icons') {
  getIcons((err) => {
    if (err) {
      throw err;
    }
    exec(`aws s3 sync s3_bucket s3://${process.env.S3_BUCKET} --acl public-read`, (err2) => {
      if (err2) {
        throw err2;
      }
      exec('rm -rf s3_bucket', (err3) => {
        if (err3) {
          throw err3;
        }
        process.exit();
      });
    });
  });
} else {
  console.warn('No valid arguments, run with "data" or "icons" argument');
  process.exit();
}
