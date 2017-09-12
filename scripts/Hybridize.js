'use strict';
/**
 *
 * TO RUN:
 * You need node 7.6+
 * If you're on 7.x run with the flag node --harmony-async-await
 * If you're on 8.x no flag
 *
 */

const fs = require('fs');
const path = require('path');
const argv = require('yargs')
              .usage('Usage: --path [path_to_folder] --write [bool] -v[v][v]\r\n v is verbose mode: 1v is less verbose and 3 most verbose')
              .demandOption(['path'])
              .count('verbose')
              .alias('v', 'verbose')
              .argv;



let VERBOSE_LEVEL = argv.verbose,
    allObservers = {},
    allFunctions = {},
    hasLog = false,
    shouldWrite = false,
    currentFileName;

function WARN()  {
  if(VERBOSE_LEVEL >= 0) {
    if(!hasLog) {
      console.log('Process ' + folderNameFromPath(currentFileName));
      console.log('============================');
      hasLog = true;
    }
    console.log.apply(console, arguments);
  }
}
function INFO()  {

  if(VERBOSE_LEVEL >= 1) {
    if(!hasLog) {
      console.log('Process ' + folderNameFromPath(currentFileName));
      console.log('============================');
      hasLog = true;
    }
    console.log.apply(console, arguments);
  }
}
function DEBUG() {
  if(VERBOSE_LEVEL >= 2) {
    if(!hasLog) {
      console.log('Process ' + folderNameFromPath(currentFileName));
      console.log('============================');
      hasLog = true;
    }
    console.log.apply(console, arguments);
  }
}

function hybridize() {
  console.log('Starting hybridization\n\n');

  if(!Array.isArray(argv.path)) {
    argv.path = [argv.path];
  }
  let files = findElementsFile(argv.path);

  if(argv.write) {
    shouldWrite = argv.write;
  }

  let data = [];

  for(let folder of argv.path) {
    for (let file of files[folderNameFromPath(folder)]) {
      currentFileName = folder + '/' + file;
      hasLog = false;
      processFile();
    }
  }
};

function processFile() {

  let src = fs.readFileSync(currentFileName, 'utf8');

  if(src.match(/\s*Polymer\s*\(\s*{\s*is/)) {
    processElement(src);
  } else {
    processBehavior(src);
  }

  if(hasLog) {
    console.log('\r\n');
  }
}

function processElement(src) {

  let observers = findObservers(src, currentFileName),
      functions = findFunctions(src, currentFileName),
      functionsNames = Object.keys(functions),
      adjustedIndex = 0,
      currentFunction,
      functionsToProcess = triageFunctionsToProcess(observers, functions),
      injection,
      injected = false;

  allObservers[currentFileName] = observers;

  for(let i=0; i<functionsToProcess.length; i++) {

    if(!src.slice(functionsToProcess[i].index, functionsToProcess[i].index + 100).match(/if\(this.hasUndefinedArguments\(arguments\)\)/)) {

      DEBUG('injecting ' + functionsToProcess[i].name);
      injection = '\r\n' + generateSpaces(functionsToProcess[i].spaceLength + 2);
      injection += 'if(this.hasUndefinedArguments(arguments)) {\r\n';
      injection += generateSpaces(functionsToProcess[i].spaceLength + 4) + 'return;\r\n';
      injection += generateSpaces(functionsToProcess[i].spaceLength + 2) + '}\r\n';
      src = src.slice(0, functionsToProcess[i].index) + injection + src.slice(functionsToProcess[i].index);
    } else {
      DEBUG(functionsToProcess[i].name + ' already injected');
    }
  }

  if(functionsToProcess.length) {
    //inject behavior
    src = injectBehavior(src);
    if(shouldWrite) {
      INFO('writing ' + currentFileName);
      fs.writeFileSync(currentFileName, src, 'utf8');
    }
  } else {
    DEBUG('no functions required change');
  }
}

function processBehavior() {

}

function generateSpaces(number) {
  var str = '';
  for(let i=0; i<number; i++) {
    str = ' ' + str;
  }

  return str;
}

function injectBehavior(src) {

  //search for behaviors first
  var behaviorsRegExp = / *behaviors\s*:\s*\[([^]*?)\]/g,
      tmpArray;

  if((tmpArray = behaviorsRegExp.exec(src)) !== null) {

    //ensure it's not already been added
    if(!tmpArray[1].match(/PxVisBehavior\.observerCheck/)) {

      //inject new behavior
      var behaviorStart = /( *)behaviors\s*:\s*\[/.exec(tmpArray[0]);
      src = src.slice(0, tmpArray.index + behaviorStart[0].length) + '\r\n' + generateSpaces(behaviorStart[1].length + 2) + 'PxVisBehavior.observerCheck,' + src.slice(tmpArray.index + behaviorStart[0].length);
    } else {
      DEBUG('behavior PxVisBehavior.observerCheck already defined in behavior array');
    }
  } else {
    INFO('tried to inject behavior but couldn\'t find behavior array');
  }
  return src;
}

function triageFunctionsToProcess(observers, functions) {

  let functionsNames = Object.keys(functions),
      result = [];

  for(let i=0; i<observers.observers.length; i++) {

    if(functionsNames.indexOf(observers.observers[i]) !== -1) {

      result.push({
        'name': observers.observers[i],
        'index': functions[observers.observers[i]].index,
        'spaceLength': functions[observers.observers[i]].spaceLength
      });
    } else {
      WARN('observer ' + observers.observers[i] + ' is declared in ' + folderNameFromPath(currentFileName) + ' in its observers array but couldn\'t be found in the file. Manually update it where it is defined');
    }
  }

  for(let i=0; i<observers.singleObservers.length; i++) {

    if(functionsNames.indexOf(observers.singleObservers[i]) !== -1) {

      result.push({
        'name': observers.singleObservers[i],
        'index': functions[observers.singleObservers[i]].index,
        'spaceLength': functions[observers.singleObservers[i]].spaceLength
      });
    } else {
      WARN('observer ' + observers.singleObservers[i] + ' is declared in ' + folderNameFromPath(currentFileName) + ' as a single property observer but couldn\'t be found in the file. Manually update it where it is defined');
    }
  }

  for(let i=0; i<observers.computed.length; i++) {

    if(functionsNames.indexOf(observers.computed[i]) !== -1) {

      result.push({
        'name': observers.computed[i],
        'index': functions[observers.computed[i]].index,
        'spaceLength': functions[observers.computed[i]].spaceLength
      });
    } else {
      WARN('computed function ' + observers.computed[i] + ' is declared in ' + folderNameFromPath(currentFileName) + ' but couldn\'t be found in the file. Manually update it where it is defined');
    }
  }

  //sort functions so that we will process them starting at the end of the file
  //and going up. This is to make sure that our indexes are not going to be
  //changed by injecting strings in src
  return result.sort(function(a,b) {
    return b.index - a.index;
  });
}

function findObservers(src) {
  let singleObsRegExp = /observer\s*:\s*['"](.*)['"]/g,
      observersRegExp = /observers\s*:\s*\[((?:\s*['"].*\(.*\)['"],?\s*)*)\]/g,
      computedRegExo = /computed\s*:\s*['"](.*)['"]/g,
      functionRegEXp = /.*\(.*\),?/g,
      result = {
        'singleObservers': [],
        'observers': [],
        'computed': []
      },
      tmpArray,
      tmpMatch,
      tmpStr;

  //find all 'observer' lines and get the function name
  while ((tmpArray = singleObsRegExp.exec(src)) !== null) {

    if(result.singleObservers.indexOf(tmpArray[1]) === -1) {
      result.singleObservers.push(tmpArray[1]);
    }
  }
  if(!result.singleObservers.length) {
   DEBUG('no observer in ' + folderNameFromPath(currentFileName));
  }

  //find all 'computed' lines and get the function name
  while ((tmpArray = computedRegExo.exec(src)) !== null) {

    var tmpp = tmpArray[1].trim().match(/['"]?(.*)\(.*\)['"]?/)[1];
    if(result.computed.indexOf(tmpp) === -1) {
      result.computed.push(tmpp);
    }
  }
  if(!result.computed.length) {
   DEBUG('no computed in ' + folderNameFromPath(currentFileName));
  }

  //find "observers" array
  tmpMatch = observersRegExp.exec(src);
  if(tmpMatch) {
    tmpStr = tmpMatch[1];
    //find every function
    while ((tmpArray = functionRegEXp.exec(tmpStr)) !== null) {
      //find function name
      var tmpp = tmpArray[0].trim().match(/['"]?(.*)\(.*\)['"]?/)[1];
      if(result.observers.indexOf(tmpp) === -1) {
        result.observers.push(tmpp);
      }
    }
  } else {
   DEBUG('no observers array in ' + folderNameFromPath(currentFileName));
  }

  return result;
}

/**
 * Finds all functions for a polymer element
 * @param {*} src
 * @param {*} fileName
 */
function findFunctions(src) {
  let functionRegExp = /^(\s*)(.*)\s*:\s*function.*/gm,
      tmpArray,
      result = [];

    while ((tmpArray = functionRegExp.exec(src)) !== null) {
      //find function name
      result[tmpArray[2].trim()] = {
        'index': tmpArray.index + tmpArray[0].length,
        'spaceLength': tmpArray[1].length - 1
      };
    }

    return result;
}

function findElementsFile(folders) {
  let filesFound = {},
      fileRegExp = /px-.*\.html$/,
      files;

  //read all files and find the one we might be interested in
  for(let folder of folders) {
    files = fs.readdirSync(folder);
    filesFound[folderNameFromPath(folder)] = [];
    files.forEach(file => {
      if(file.match(fileRegExp)) {
        filesFound[folderNameFromPath(folder)].push(file);
      }
    });
  }

  return filesFound;
}

function folderNameFromPath(path) {
  return path.substring(path.lastIndexOf('/')+1);
}

hybridize();
