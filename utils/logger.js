function consoleLog(txt, obj = null) {
    const logTxt = txt + (obj ? JSON.stringify(obj) : '');
    const maxLength = 100;
    console.log(logTxt.length > maxLength ? logTxt.slice(0, maxLength) + '...' : logTxt);
}


module.exports = { consoleLog };