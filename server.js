/**
 *@summary PlacePort Server. It is a web app that generates placeholder images on demand.
 *
 * @creativeMarks
 * FILE PERSISTANCE: When the FILE_PERSISTANCE constant is set to true, all stats will be persisted
 * to disk, this means that if the server was to turn off and come back online again, all stats will
 * still exist and will be viewable once again from the /stats(.html) page. This is currently set to
 * false so it does not damage the tests as the tests expect empty starting results. Examples:
 * https://i.imgur.com/3UDEjeV.gif - https://i.imgur.com/46DxAae.png - %userprofile%/persistance
 *
 * RANDOM ROUTE: When the user requests on the root  route of image "/img" with no following width,
 * height, square and text then a random image will be generated for them. If the square and text
 * are given then they will be used otherwise randomly set. Examples:
 * https://i.imgur.com/z1KsHXW.gif - http://localhost:8080/img
 *
 * RANDOM ROUTE AMOUNT: When the user requests the root route of image "/img" with a amount property
 * they will get a json response of a list of url paths of generated random images. They can choose
 * to use the image text if they use this route. Examples: http://localhost:8080/img?amount=50 -
 * http://localhost:8080/img?amount=500&text=generated - https://i.imgur.com/xoVS6Nc.png
 *
 * INSPIRATION: Making a request on /{width}/{height}/inspiration will provide a image with a random
 * inspirational quote, text query will be rejected but the square will be accepted. Examples:
 * https://i.imgur.com/ai35qEv.png - http://localhost:8080/img/500/200/inspiration
 *
 * LOGGING: All routes are logged (start and the end) with generated unique ids, these ids can be
 * used to locate the start and end of the request (when multiple requests are being called all at
 * the time same). The ids are not purely random but this is not important as they just have to be
 * unique for the time frame of the request, which is a minimal amount of time. Example: View
 * console.
 *
 * STATS ROUTE: Better stats route, going to /stats will pass the stats.html file so you no longer
 * need to go to /stats.html. Example: http://localhost:8080/stats
 *
 * FIXED RACE CONDITION: Fixed the stream race condition that can cause overlapping pipping canvas
 * outputs (view image lib send method) by awaiting on the stream ending. This is slower in the
 * requesting process but completely removes the chance of duplicate image outputs.
 *
 * @author UP840877 <up840877@myport.ac.uk>
 *
 * Created at     : 2019-01-07 08:59:15
 * Last modified  : 2019-01-09 11:44:40
 */

const express = require('express');
const fs = require('fs');
const ifs = require('os').networkInterfaces();
const path = require('path');

const imager = require('./imager/imager');
const projectConfiguration = require('./package.json');

/*********************************************************************
 * UTILITIES
 ********************************************************************/

/**
 * Validates that a value is either null or undefined.
 * @param {any} value The value being checked.
 */
const isNil = (value) => value == null;

/**
 * Loops through the arguments replacing each %s within the string as it goes along, along as they
 * exist in the string. for example: "hello %s", "person" -> "hello person".
 * @param {string} stringValue The string value with the %s string replacements.
 * @param  {...any} args all argument replacements.
 */
function formatString(stringValue, ...args) {
  args.forEach((element) => {
    if (stringValue.includes('%s')) stringValue = stringValue.replace('%s', element);
  });

  return stringValue;
}

/**
 * Generates a random short id used through  the application.
 */
function generateId() {
  const base = Math.random().toString(26);
  return base.substr(2, 6);
}

/**
 * When we are building up zips of images used through out the application, we want to wait for the
 * image to be generated to stop race conditions. This is also used to fix any race conditions
 * within the image routing lib.
 * @param {streamObject} stream The stream object that allows pipping content.
 */
function streamPromise(stream) {
  return new Promise((resolve, reject) => {
    stream.on('end', () => resolve('end'));
    stream.on('finish', () => resolve('finish'));
    stream.on('error', () => reject(error));
  });
}

/**
 * Generates a random number between min and max.
 * @param {number} min The minimum number of the random number.
 * @param {number} max The maximum number of the random number.
 */
const getRandomNum = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

/**
 * Gets a random words based on a given list or default constants list.
 * @param {array} words The words to get the random word from.
 */
const getRandomWord = (words = constants.WORDS) => words[getRandomNum(0, words.length - 1)];

/**
 * The currently executing network address of the user.
 */
const networkIpAddress = Object.keys(ifs)
  .map((x) => ifs[x].filter((x) => x.family === 'IPv4' && !x.internal)[0])
  .filter((x) => x)[0].address;

/*********************************************************************
 * CONSTANTS
 ********************************************************************/

/**
 * Constants used throughout the application which stay constant and the chance of change will be
 * minimal.
 */
const constants = {
  /**
   * IMPORTANT: this is a important section of the server and cannot be adjusted likely, if this
   * constant is adjusted to be TRUE (lowercase) at runtime, all stats will be stored and kept on
   * disk, persisting the stats to be around on restarting of the server. If ths constant is set to
   * FALSE (lowercase), then the server will clear all stats when it shuts down (clearing memory).
   * FALSE for tests!
   */
  FILE_PERSISTANCE: false,
  /**
   * The maximum size of the images width and height.
   */
  GRID_MAX: 2000,
  /**
   * The minimum size of the images with and height.
   */
  GRID_MIN: 1,
  /**
   * The minimum size of the squares of the image.
   */
  SQUARE_MIN: 1,
  /**
   * If amounts are used, then the zip the files but we require a min of 2 files at time.
   * The min amount of zipped: 2
   */
  AMOUNT_MIN: 2,
  /**
   * If amounts are used, then the zip the files but we only support 10 files at time.
   * The max amount of zipped: 10
   */
  AMOUNT_MAX: 2000,
  /**
   * Due to limits of zipping folders not being possible in the current state, we will have to
   * delete all the files and the folder in the bulk amount image sending after a fixed amount of
   * time. e.g 5 minutes.
   */
  FOLDER_DELETE_TIMEOUT: 0.5 * 60 * 1000,

  /**
   * List of random words used for random word + words generation.
   */
  WORDS: [
    'boom',
    'lettuce',
    'substance',
    'bear',
    'discover',
    'savory',
    'party',
    'zippy',
    'potato',
    'gainful',
    'sharp',
    'move',
    'offbeat'
  ],
  /**
   * Quotes used for inspirational image generation.
   */
  QUOTES: [
    'Turn your %s into wisdom.',
    'Wherever you go, go with all your %s.',
    '%s is a waking dream.',
    'If you %s it, you can %s it.',
    'Dream %s and dare to %s.'
  ]
};

/**
 * HTTP Codes used throughout the application. Used within a constants reduce the chance of false
 * values being entered
 */
const httpCodes = {
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  OK: 200
};

/**
 * Colors used throughout the logging of the requests.
 */
const colors = {
  RESET: '\x1b[0m',
  FGGREEN: '\x1b[32m',
  FGRED: '\x1b[31m',
  FGCYAN: '\x1b[36m',
  FGBLACK: '\x1b[30m',
  BGYELLOW: '\x1b[43m'
};

/*********************************************************************
 * LOGGING
 ********************************************************************/

/**
 * Logs a formatted, coloured log message to the console, designed for requests.
 * @param {string} type The type (log, error, etc).
 * @param {string} token The token reference to track the request.
 * @param {string} prefix Prefix text of the message.
 * @param {string} message The core printed message.
 * @param {string} appendix The appendix of the message.
 */
function cleanLog(type = 'log', token = '', prefix = '', message = '', appendix = '') {
  console[type](
    `${colors.BGYELLOW}${colors.FGBLACK}`,
    type.toUpperCase(),
    `${colors.RESET}${colors.FGRED}`,
    token,
    colors.RESET,
    prefix,
    colors.FGGREEN,
    message,
    colors.RESET,
    appendix
  );
}

/**
 * At the start of all http requests on the platform, a init id will be set for the request and the
 * request will be logged. Tagging the finish of the request to the end end log method to log the
 * ending results of the request.
 */
function logRequestStart(req, res, next) {
  req.logInfo = {
    token: generateId(),
    time: Date.now()
  };

  // grab the requesters ip address from the headers or socket connection if possible.
  const sender = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  cleanLog('log', req.logInfo.token, 'Started'.padEnd(9), `${req.method} ${req.originalUrl}`, sender);

  res.on('finish', logRequestEnd.bind(this, req, res));
  next();
}

/**
 * Occurs when the request fires the finish event, this will log the end of the request, logging as
 * a error if a internal server error occurs during the process.
 */
function logRequestEnd(req, res) {
  const { statusCode, _contentLength } = res;
  const { logInfo } = req;

  let loggerType = 'log';
  const timeTaken = Date.now() - logInfo.time;

  // we want to make it clear something went wrong, change to a error message.
  if (statusCode === httpCodes.INTERNAL_SERVER_ERROR) loggerType = 'error';
  cleanLog(loggerType, req.logInfo.token, 'Completed', `${statusCode} ${_contentLength} in ${timeTaken}ms`);
}

/*********************************************************************
 * State Management
 ********************************************************************/

/**
 * The state managers job is to hold and manage data entries within a array format of a given name.
 * With the option to keep and store all the data on disk if given the boolean express too. This
 * means that when gathering data, it will use the on disk data if set, allowing the server to
 * persist data between sessions. Stopping the loss of data if the server went down.
 */
class StateManagement {
  /**
   * Creates a new instance of the state manager.
   * @param {string} location The location that will be storing the json arrays.
   * @param {boolean} filePersistance If we are persisting the data to disk.
   */
  constructor(location, filePersistance) {
    // The location of the files being stored.
    this.location = location;

    // The default file type used for storing.
    this.fileType = 'json';

    // If the states are going to be persisted on disk or not.
    this.filePersistance = filePersistance;

    // The in memory caching of the state.
    this.localPersistance = {};

    // Make sure to create the persisting folder if it does not exist
    if (!fs.existsSync(this.location) && this.filePersistance) {
      fs.mkdirSync(this.location);
    }
  }

  /**
   * Adds a new entry to the memory state or disk (if persistance is set) json object.
   * @param {string} name The name of the json file being added too.
   * @param {any} entry The entry being added.
   * @param {number} persistAmount The amount of data that should be persisted in the array.
   * @param {boolean} increment If we should be incrementing values or keeping them concurrently.
   */
  addArrayEntry(name, entry, persistAmount, increment = true) {
    if (!this._canAdd(entry)) return;

    let content = this.getArrayEntries(name, false, false);

    if (!increment || !this._incrementIfExists(content, entry)) {
      content.push({ entry, time: Date.now(), count: 1 });
    }

    // if a persistance amount has been set, and it needs reducing in size after sorting. We have to
    // sort by time as we cannot rely on the ordering due to race conditions.
    if (!isNil(persistAmount) && content.length > persistAmount) {
      content = content.sort((a, b) => b.time - a.time);
      content.pop();
    }

    // write the updated entries to memory and disk if required.
    this.writeArrayEntries(name, content, persistAmount);
  }

  /**
   * Adds a new entry to the memory state or disk (if persistance is set) json object but the
   * persistance is based around the count and time, not just the time.
   * @param {string} name The name of the json file being added too.
   * @param {any} entry The entry being added.
   * @param {number} persistAmount The amount of data that should be persisted in the array.
   * @param {boolean} increment If we should be incrementing values or keeping them concurrently.
   */
  addArrayCountEntry(name, entry, persistAmount, increment = true) {
    if (!this._canAdd(entry)) return;

    let content = this.getArrayEntries(name, false, false);

    if (!increment || !this._incrementIfExists(content, entry)) {
      content.push({ entry, time: Date.now(), count: 1 });
    }

    // if a persistance amount has been set, and it needs reducing in size after sorting. We have to
    // sort by count as these data items focus around the amount of uses and hits.
    if (!isNil(persistAmount) && content.length > persistAmount) {
      content.sort((a, b) => (a.count === b.count ? b.time - a.time : b.count - a.count));
      content.pop();
    }

    // write the updated entries to memory and disk if required.
    this.writeArrayEntries(name, content, persistAmount);
  }

  /**
   * Gets all the entries being stored within the json file by the name.
   * @param {string} name The name of the reference storing the data.
   * @param {bool} map If we should map out just the entry or not.
   * @param {bool} order If we should order by time or not.
   */
  getArrayEntries(name, map = true, order = true) {
    const file = path.join(this.location, `${name}.${this.fileType}`);
    let content = this.localPersistance[name] || [];

    if (this.filePersistance && fs.existsSync(file)) {
      content = JSON.parse(fs.readFileSync(file)) || [];
    }

    // given the option, order base on time and map all the content out (just the entries, no time
    // or count) if also selected by the user. But default to ordering and mapping out.
    if (order) content = content.sort((a, b) => a.time < b.time);
    return map ? content.map((x) => x.entry) : content;
  }

  /**
   * Removes all entries that are currently being stored within the json file by the name.
   * @param {string} name The name of which the data is being stored under.
   */
  removeArrayEntries(name) {
    this.writeArrayEntries(name, []);
  }

  /**
   * Writes the data into the state managed memory or file.
   * @param {string} name The name of the reference for the data.
   * @param {*} entries The entries being written after validation.
   */
  writeArrayEntries(name, entries) {
    if (this.filePersistance) {
      const file = path.join(this.location, `${name}.json`);
      fs.writeFileSync(file, JSON.stringify(entries, null, 4));
    }

    // keep the in-memory store up to date.
    this.localPersistance[name] = entries;
  }

  /**
   * If the entry already exists, increment the count.
   * @param {object} content The content being checked.
   * @param {object} entry The object that will be incremented if it exists.
   * @returns true or false if it incremented or not.
   */
  _incrementIfExists(content, entry) {
    const storedEntry = content.filter((x) => JSON.stringify(x.entry) === JSON.stringify(entry))[0];

    if (!isNil(storedEntry)) {
      this._incrementEntry(storedEntry);
      return true;
    }

    return false;
  }

  /**
   * Increment a single entry incremental properties (time, count)
   * @param {object} entry The entry being incremented.
   */
  _incrementEntry(entry) {
    entry.time = Date.now();
    entry.count += 1;
  }

  /**
   * Checks that the value of the object can be added and its not a empty object, array or value.
   * @param {any} entry The value that wants to be added.
   */
  _canAdd(entry) {
    if (isNil(entry)) return false;
    if (typeof entry === 'string' && entry === '') return false;
    if (Array.isArray(entry) && a.length === 0) return false;
    return true;
  }
}

/*********************************************************************
 * IMAGE + IMAGE LIMIT VALIDATION
 ********************************************************************/

/**
 * Validates that the width and height params of the request meet the requirements of the project.
 * Width and height must be a integer, positive (at least 1), less than or equal to 2000
 * @param {number | string} req.params.width The width of the image being generated.
 * @param {number | string} req.params.height The height of the image being generated.
 */
function validateWidthAndHeightRequirements(req, res, next) {
  let { width, height } = req.params;

  // if height is nil then we are using just the width route (create a square image using the width)
  if (isNil(height)) height = width;

  // if either width or height are not valid, there is no point performing numeric operations.
  if (isNil(width) || isNil(height)) {
    return res
      .status(httpCodes.BAD_REQUEST)
      .send({ error: 'Height & Width', message: 'The width & height must be set to create a image.' });
  }

  // if either width or height are not numbers, there is no point performing numeric operations.
  if (isNaN(width) || isNaN(height)) {
    return res
      .status(httpCodes.BAD_REQUEST)
      .send({ error: 'Height & Width', message: 'The width & height must be set to create a image.' });
  }

  width = parseFloat(width);
  height = parseFloat(height);

  // we must validate that it is a integer and not a float / double.
  if (width % 1 !== 0 || height % 1 !== 0) {
    return res.status(httpCodes.BAD_REQUEST).send({
      error: 'Height & Width',
      message: `The height & width must be integers (no decimal places).`
    });
  }

  // validate that the width and height are within the upper bounds.
  if (width > constants.GRID_MAX || height > constants.GRID_MAX) {
    return res.status(httpCodes.FORBIDDEN).send({
      error: 'Height & Width',
      message: `The height & width must equal to or less than ${constants.GRID_MAX}.`
    });
  }

  // validate that the width and height are within the lower bounds.
  if (width < constants.GRID_MIN || height < constants.GRID_MIN) {
    return res.status(httpCodes.BAD_REQUEST).send({
      error: 'Height & Width',
      message: `The height & width must equal to or greater than ${constants.GRID_MIN}.`
    });
  }

  // make sure to update the parameters to be the parsed number versions otherwise we would then
  // have to do the conversions again later (depending on how the lib handles the string values).
  // This just stops future stress.
  req.params.width = width;
  req.params.height = height;

  next();
}

/**
 * Must make sure that the square value if set is a positive integer.
 * @param {number | string} req.query.square The square size that will be used on the image.
 */
function validateSquareRequirements(req, res, next) {
  const { square } = req.query;
  const parsedSquare = parseFloat(square);

  // if its not set, then there is no point continuing as its a optional value.
  if (isNil(square)) return next();

  // if the square is not a number then there is no point performing numeric operations.
  if (isNaN(square)) {
    return res
      .status(httpCodes.BAD_REQUEST)
      .send({ error: 'Square', message: 'The square query must be a integer if set.' });
  }

  // if its not a number or less than the base limit its outside the scope of the square limits.
  if (!isNaN(parsedSquare) && parsedSquare < constants.SQUARE_MIN) {
    return res
      .status(httpCodes.BAD_REQUEST)
      .send({ error: 'Square', message: 'The square query must be a positive integer if set.' });
  }

  // we must validate that it is a integer and not a float / double.
  if (parsedSquare % 1 !== 0) {
    return res
      .status(httpCodes.BAD_REQUEST)
      .send({ error: 'Square', message: `The square must be an integer (no decimal places).` });
  }

  // make sure to update the parameters to be the parsed number versions otherwise we would then
  // have to do the conversions again later.
  req.query.square = parsedSquare;

  next();
}

/**
 * Validates that the amount optional parameter for random image generating is meeting the
 * requirements if set. Otherwise continue if not set. If they have set the square we then have to
 * validate that they are not using square
 * @param {number | string} req.query.amount The optional amount query.
 * @param {number | optional} req.query.square The square size that will be used on the image.
 */
function validateAmountRequirements(req, res, next) {
  const { amount, square } = req.query;
  const parsedAmount = parseFloat(amount);

  // amount will be a optional extra, so if its not set then just continue and send a single file.
  if (isNil(amount)) return next();

  // make sure its in the bounds of the limits of the amounts query.
  if (amount < constants.AMOUNT_MIN || amount > constants.AMOUNT_MAX) {
    return res.status(httpCodes.BAD_REQUEST).json({
      error: 'Amount',
      message: `Amount query cannot be less ${constants.AMOUNT_MIN} or greater than ${constants.AMOUNT_MAX}`
    });
  }

  // we must validate that it is a integer and not a float / double.
  if (amount % 1 !== 0) {
    return res.status(httpCodes.BAD_REQUEST).send({
      error: 'Amount',
      message: `The amount must be an integer (no decimal places).`
    });
  }

  if (!isNil(square)) {
    return res.status(httpCodes.BAD_REQUEST).send({
      error: 'Square',
      message: `If you are using the amount property, square.`
    });
  }

  req.query.amount = parsedAmount;
  next();
}

/**
 * Generates random width, height for the root image route, and sets the text + square if not set.
 * @param {number | string | optional} req.query.square The square size that will be used on the image.
 * @param {string | optional} req.query.text The optional text that will be displayed on the image.
 */
function generateRandomProperties(req, res, next) {
  const { square, text } = req.query;

  // generate the random width and height, we set it to the params as these will be used through the
  // request (including sending the image)
  req.params.width = getRandomNum(constants.GRID_MIN, constants.GRID_MAX);
  req.params.height = getRandomNum(constants.GRID_MIN, constants.GRID_MAX);

  // if square or text is not set, then generate random values for them.
  if (isNil(square)) req.query.square = getRandomNum(constants.SQUARE_MIN, 250);
  if (isNil(text) || text === '') req.query.text = getRandomWord();

  next();
}

/**
 * Generates a inspirational quote to be used for the text, if the text is set then bad request the
 * user for setting the text when its not expected. accepting empty text queries.
 * @param {string | optional} req.query.text The optional text that will be displayed on the image.
 */
function generateInspirationalQuote(req, res, next) {
  const { text } = req.query;

  // when generating quotes and the user sets the text, we must let them know that text cannot set
  // text to use this route.
  if (!isNil(text)) {
    return res
      .status(httpCodes.BAD_REQUEST)
      .json({ error: 'Text', message: 'Text query cannot be set if you are looking for a inspiration' });
  }

  // generate a random but generic quote.
  let randomQuote = constants.QUOTES[getRandomNum(0, constants.QUOTES.length - 1)];
  const amountToReplace = randomQuote.match(/%s/g).length;

  // Generate a random word for all missing cases that need filling.
  for (let index = 0; index < amountToReplace; index++) {
    randomQuote = formatString(randomQuote, getRandomWord());
  }

  req.query.text = randomQuote;

  next();
}

/**
 * If the amount query is set on the random route then we will build up a zip file of that amount of
 * random images, within the limits of the min and max. NOTE: Stats are not being tracked if the amount is set.
 * @param {number | optional} req.query.amount The optional amount of images that will be zipped.
 */
async function buildImageListingIfRequired(req, res, next) {
  const { amount, text } = req.query;

  // amount will be a optional extra, so if its not set then just continue and send a single file.
  if (isNil(amount)) return next();

  const images = [];

  for (let index = 1; index <= amount; index++) {
    const width = getRandomNum(constants.GRID_MIN, constants.GRID_MAX);
    const height = getRandomNum(constants.GRID_MIN, constants.GRID_MAX);
    const square = getRandomNum(constants.SQUARE_MIN, 250);
    const display = isNil(text) ? '' : `&text=${text}`;

    // push the image direct link onto the images array to be sent to the user.
    images.push(`http://${req.headers.host}/img/${width}/${height}?square=${square}${display}`);
  }

  res.json(images);
}

/**
 * Builds up and sends the image to the client based on the width, height, square and text.
 * @param {number | string} req.params.width The width of the image being generated.
 * @param {number | string} req.params.height The height of the image being generated.
 * @param {number | optional} req.query.square The square size that will be used on the image.
 * @param {string | optional} req.query.text The optional text that will be displayed on the image.
 */
async function sendImagerModule(req, res) {
  const { width, height } = req.params;
  const { square, text } = req.query;

  await imager.sendImage(res, width, height, square, text);
  await streamPromise(res);
}

/*********************************************************************
 * STATS
 ********************************************************************/

/**
 * Right before we attempt to send the image to the user, we want to go and save all the stats
 * related to the allocated request.
 * @param {number | string} req.params.width The width of the image being generated.
 * @param {number | string} req.params.height The height of the image being generated.
 * @param {number | string | optional} req.query.square The square size that will be used on the image.
 * @param {string | optional} req.query.text The optional text that will be displayed on the image.
 */
function saveAllImageStats(req, res, next) {
  const { width, height } = req.params;
  const { square, text } = req.query;

  const reference = req.header('Referer');

  let path = `${req.baseUrl}/${width}/${height}`;
  if (!isNil(square)) path += `?square=${square}${isNil(text) ? '' : `&text=${escape(text)}`}`;
  if (isNil(square) && !isNil(text)) path += `?text=${escape(text)}`;

  stateManagement.addArrayEntry('hits', path, null, false);
  stateManagement.addArrayEntry('paths', path, 10);
  stateManagement.addArrayEntry('texts', text, 10);
  stateManagement.addArrayEntry('sizes', { w: width, h: height }, 10);
  stateManagement.addArrayCountEntry('sizes-all', { w: width, h: height }, 10);

  if (!isNil(reference) && reference !== '') {
    stateManagement.addArrayCountEntry('references', reference, 10);
  }

  next();
}

/**
 * Sends the stats page directly from a route and not as a resource from stats.html.
 */
function sendStatsPage(req, res) {
  return res.sendfile(path.join(__dirname, 'public', 'stats.html'));
}

/**
 * An array of the ten most recent unique texts requested and served in the images. Texts shouldn't
 * be repeated; the most recent text should be at the beginning of the array. Should be send back to
 * the client requesting this information.
 */
function sendRecentTexts(req, res) {
  return res.json(stateManagement.getArrayEntries('texts'));
}

/**
 * An array of the ten most recent unique paths requested and served. Paths shouldn't be repeated;
 * the most recent request should be at the beginning of the array. Should be send back to the client
 * requesting this information.
 */
function sendRecentPaths(req, res) {
  return res.json(stateManagement.getArrayEntries('paths'));
}

/**
 * An array of the ten most recent image sizes served. Image sizes shouldn't be repeated; the most
 * recent one should be at the beginning of the array.
 */
function sendRecentSizes(req, res) {
  return res.json(stateManagement.getArrayEntries('sizes'));
}

/**
 * An array of the top ten most-served image sizes, with how many times they have been requested.
 * The array must be ordered from the most-requested size to the least-requested one. Should be send
 * back to the client requesting this information.
 */
function sendTopSizes(req, res) {
  const sizes = stateManagement.getArrayEntries('sizes-all', false, false).sort((a, b) => a.count < b.count);
  const topSizes = sizes.map((x) => Object.assign({ n: x.count }, x.entry));
  return res.json(topSizes);
}

/**
 * An array of the top ten requesters of PlacePort images. To identify a requester, we use the HTTP
 * referer header so this stat counts the non-empty unique referrers. Should be send back to the
 * client requesting this information.
 */
function sendTopReferences(req, res) {
  const refs = stateManagement.getArrayEntries('references', false, false).sort((a, b) => a.count < b.count);
  const references = refs.map((x) => Object.assign({}, { ref: x.entry, n: x.count }));
  return res.json(references);
}

/**
 * An array of three hit counts, reporting the number of successful images served in the last 5, 10
 * and 15 seconds. Should be send back to the client requesting this information.
 */
function sendSecondHits(req, res) {
  const all = stateManagement.getArrayEntries('hits', false, true);
  const hits = [];

  // This guy is not being performed through a loop as a loop can cause flickers, causing the amount
  // to be out. We want to keep it as close as possible with the current date. I think this is
  // related to the method calling and adjusting the seconds too fast, resulting in all but the
  // first one  working with -15 and not -5, -10, etc.
  const adjusted = new Date();
  const current = new Date();

  adjusted.setSeconds(adjusted.getSeconds() - 5);
  hits.push({ title: '5s', count: all.filter((x) => x.time > adjusted && x.time < current).length });

  adjusted.setSeconds(adjusted.getSeconds() - 5);
  hits.push({ title: '10s', count: all.filter((x) => x.time > adjusted && x.time < current).length });

  adjusted.setSeconds(adjusted.getSeconds() - 5);
  const filteredFifteen = all.filter((x) => x.time > adjusted && x.time < current);
  hits.push({ title: '15s', count: filteredFifteen.length });

  // we only need to keep the last 15 seconds worth, the rest is bloat.
  stateManagement.writeArrayEntries('hits', filteredFifteen);

  return res.json(hits);
}

/**
 * When an HTTP DELETE request comes to /stats, all statistics must be cleared as if the server just
 * started. If file persistance is set to true, this will also remove all data currently being
 * stored on the disk as well.
 */
function clearAllStats(req, res) {
  stateManagement.removeArrayEntries('hits');
  stateManagement.removeArrayEntries('paths');
  stateManagement.removeArrayEntries('texts');
  stateManagement.removeArrayEntries('sizes');
  stateManagement.removeArrayEntries('sizes-all');
  stateManagement.removeArrayEntries('references');

  return res.send();
}

/*********************************************************************
 * ROUTING
 ********************************************************************/

const app = express();
const port = process.env.PORT === undefined ? 8080 : process.env.PORT;

/*********************************************************************
 * IMAGE ROUTING
 ********************************************************************/

const imageRouter = new express.Router();

/**
 * When request an image, its width and height are specified in the URL path:
 *
 * /img/{width} (width will be used as the height if not passed, creating a square)
 * /img/{width}/{height}
 *
 * There are two optional query parameters:
 * square: sets the size of the colorful squares that appear within the image.
 * text: controls what text goes in the centre of the image
 *
 * For example: /img/240/180?square=60&text=Example will serve a 240x180 image with 60x60 squares
 * and the text "Example" in the centre.
 *
 * The routes contain the supporting middleware to validate the width and height (integer, positive,
 * less than or equal to 2000), validate the optional square option is a positive integer and a
 * final middleware to sore all the stats of the valid request. Finally sending the image.
 */
imageRouter.get(
  ['/:width', '/:width/:height'],
  [validateWidthAndHeightRequirements, validateSquareRequirements, saveAllImageStats],
  sendImagerModule
);

/**
 * When a request is performed on this route, it will generate the normal image with a inspirational
 * quote as the text, all query parameters are accepted but if the text is set it will be rejected.
 * square: sets the size of the colorful squares that appear within the image.
 *
 * GET requests:
 * /img/{width}/{height}/inspiration
 * /img/2000/500/inspiration?square=60
 */
imageRouter.get(
  '/:width/:height/inspiration',
  [
    validateWidthAndHeightRequirements,
    validateSquareRequirements,
    generateInspirationalQuote,
    saveAllImageStats
  ],
  sendImagerModule
);

/**
 * When a request is performed on the route, it will be treated like they want a random image size,
 * square and text. If the square and text are set then they will be used otherwise randomly
 * generated ones instead.
 *
 * GET requests:
 *
 * /img?square=60&text=Example
 * /img?square=60
 * /img?text=Example
 * /img
 *
 * There is an additional optional parameter: amount
 * If the amount property is set, you will get a json response containing as list of image urls of the randomly generated images.
 *
 * /img?amount=200
 *
 * This route will provide the supporting middleware to generate random sizes, text and send the
 * image(s).
 */
imageRouter.get(
  '/',
  [
    validateSquareRequirements,
    validateAmountRequirements,
    buildImageListingIfRequired,
    generateRandomProperties,
    saveAllImageStats
  ],
  sendImagerModule
);

/*********************************************************************
 * STATS ROUTING
 ********************************************************************/

/**
 * Your server should keep statistics of successful image requests. The stats are showcased on a
 * page called /stats.html, provided in the public folder. See them in action at:
 * http://localhost:8080/stats.html
 */
const statsRouter = new express.Router();

/**
 * An array of the top ten requesters of PlacePort images. To identify a requester, we use the HTTP
 * referer header so this stat counts the non-empty unique referrers.
 */
statsRouter.get('/referrers/top', sendTopReferences);

/**
 * An array of the ten most recent unique paths requested and served. Paths shouldn't be repeated;
 * the most recent request should be at the beginning of the array. Optional parameters are not
 * included in the paths if they were not specified in the request. The square query parameter is
 * always presented first.
 *
 * GET: Returns the array of top paths
 */
statsRouter.get('/paths/recent', sendRecentPaths);

/**
 * An array of the ten most recent unique texts requested and served in the images. Texts shouldn't
 * be repeated; the most recent text should be at the beginning of the array.
 *
 * GET: Gets all the top 10 recently used texts for displays.
 */
statsRouter.get('/texts/recent', sendRecentTexts);

/**
 * An array of the ten most recent image sizes served. Image sizes shouldn't be repeated; the most
 * recent one should be at the beginning of the array.
 *
 * GET: Gets all the recent top 10 sizes used.
 */
statsRouter.get('/sizes/recent', sendRecentSizes);

/**
 * An array of the top ten most-served image sizes, with how many times they have been requested.
 * The array must be ordered from the most-requested size to the least-requested one.
 *
 * GET: Gets all the top 10 sizes used.
 */
statsRouter.get('/sizes/top', sendTopSizes);

/**
 * An array of three hit counts, reporting the number of successful images served in the last 5, 10
 * and 15 seconds.
 *
 * GET: Gets the hits per 5 second averages.
 */
statsRouter.get('/hits', sendSecondHits);

/**
 * When an HTTP DELETE request comes to /stats, all statistics must be cleared as if the server just
 * started.
 *
 * DELETE: Removes all current stats being recorded by the server.
 */
statsRouter.delete('/', clearAllStats);

/**
 * When the HTTP get request is performed on the /stats endpoint, return the single html file, this
 * is a cleaner approach than doing /stats.html.
 */
statsRouter.get('/', sendStatsPage);

/*********************************************************************
 * ROUTE REGISTERING
 ********************************************************************/

/**
 * Used to manage and keep all data persisted so that if the server goes off line we will still have
 * the active stats about the server. Otherwise we will lose important information when the server
 * restarts. Its important to note that it will only persist on disk if the setting is marked as
 * true within the constants.
 */
const stateManagement = new StateManagement(
  path.join(process.env[process.platform == 'win32' ? 'USERPROFILE' : 'HOME'], 'Persistance'),
  constants.FILE_PERSISTANCE
);

// make sure the static content is served but not apart of the api logging.
app.use(express.static('public'));

// Make sure that we log all requests.
app.use(logRequestStart);

// Bind all the routes.
app.use('/img', imageRouter);
app.use('/stats', statsRouter);

app.listen(port, () => {
  console.info(`initialized ${projectConfiguration.name}, version=v${projectConfiguration.version}`);
  console.info(`http://localhost:${port}/ | http://${networkIpAddress}:${port}/`);
});
