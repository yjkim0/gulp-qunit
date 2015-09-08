'use strict';

var path = require('path'),
    childProcess = require('child_process'),
    gutil = require('gulp-util'),
    chalk = require('chalk'),
    through = require('through2'),
    phantomjs = require('phantomjs'),
    binPath = phantomjs.path,
    fs = require('fs');

module.exports = function (params) {
    var options = params || {};
    binPath = options.binPath || binPath;

    return through.obj(function (file, enc, cb) {
        var absolutePath = path.resolve(file.path),
            isAbsolutePath = absolutePath.indexOf(file.path) >= 0;

        var childArgs = [];
        if (options['phantomjs-options'] && options['phantomjs-options'].length) {
            childArgs.push( options['phantomjs-options'] );
        }

        var runnerPath = '';
        if ( options['runner-junit-xml'] ) {
            runnerPath = './runner-junit-xml.js';
        } else {
            runnerPath = './node_modules/qunit-phantomjs-runner/runner-json.js';
        }
        childArgs.push(
            path.join(__dirname, runnerPath),
            (isAbsolutePath ? 'file:///' + absolutePath.replace(/\\/g, '/') : file.path)
        );

        if ( options.timeout ) {
            childArgs.push( options.timeout );
        }

        if (file.isStream()) {
            this.emit('error', new gutil.PluginError('gulp-qunit', 'Streaming not supported'));
            return cb();
        }

        childProcess.execFile(binPath, childArgs, function (err, stdout, stderr) {
            var passed = true;

            gutil.log('Testing ' + file.relative);

            if (stdout) {
                if (options['runner-junit-xml']) {
                    stdout.trim().split('\n').forEach(function(line) {
                        try {
                            var jsonResult = JSON.parse(line);
                            var filePath = (options['xml-path'] || __dirname);
                            filePath += '/' + (options['xml-filename'] || '/junit.xml');
                            fs.writeFile(filePath, jsonResult.junitXml, function (err) {
                                if (err) return console.log(err);
                            });
                        } catch(e) {
                        }
                    });
                }

                try {
                    var out,
                        result,
                        color;

                    stdout.trim().split('\n').forEach(function(line) {
                        if (line.indexOf('{') !== -1) {
                            out = JSON.parse(line.trim());
                            if (!out.result) return;
                            result = out.result;

                            color = result.failed > 0 ? chalk.red : chalk.green;

                            gutil.log('Took ' + result.runtime + ' ms to run ' + chalk.blue(result.total) + ' tests. ' + color(result.passed + ' passed, ' + result.failed + ' failed.'));

                            if(out.exceptions) {
                                for(var test in out.exceptions) {
                                    gutil.log('\n' + chalk.red('Test failed') + ': ' + chalk.red(test) + ': \n' + out.exceptions[test].join('\n  '));
                                }
                            }
                        } else {
                            line = line.trim(); // Trim trailing cr-lf
                            gutil.log(line);
                        }
                    });
                } catch (e) {
                    this.emit('error', new gutil.PluginError('gulp-qunit', e));
                }
            }

            if (stderr) {
                gutil.log(stderr);
                this.emit('error', new gutil.PluginError('gulp-qunit', stderr));
                passed = false;
            }

            if (err) {
                gutil.log('gulp-qunit: ' + chalk.red('✖ ') + 'QUnit assertions failed in ' + chalk.blue(file.relative));
                this.emit('error', new gutil.PluginError('gulp-qunit', err));
                passed = false;
            } else {
                gutil.log('gulp-qunit: ' + chalk.green('✔ ') + 'QUnit assertions all passed in ' + chalk.blue(file.relative));
            }

            this.emit('gulp-qunit.finished', {'passed': passed});

            this.push(file);

            return cb();
        }.bind(this));
    });
};
