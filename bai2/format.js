const fs = require('fs');

// 指定字段顺序
const groupOrder = [
  "receiver", "originator", "groupStatus", "asOfDate", "asOfTime", "currencyCode", "asOfDateModifier",
  "groupControlTotal", "numberOfAccounts", "numberOfRecords", "Accounts"
];
const accountOrder = [
  "accountNumber", "currencyCode", "summaries", "accountControlTotal", "numberRecords", "Details"
];

function parseBAI2(lines) {
  let result = {};
  let groups = [];
  let currentGroup = null;
  let currentAccount = null;
  let currentDetails = null;
  let currentDetail = null;
  let inSummary = false;
  let inDetail = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    let parts = line.split(',');
    let recordType = parts[0];

    switch (recordType) {
      case '01':
        result.sender = parts[1];
        result.receiver = parts[2];
        result.fileCreatedDate = parts[3];
        result.fileCreatedTime = parts[4];
        result.fileIdNumber = parts[5];
        result.physicalRecordLength = parseInt(parts[6]);
        result.blockSize = parseInt(parts[7]);
        result.versionNumber = parseInt(parts[8]);
        break;
      case '02':
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          receiver: parts[1],
          originator: parts[2],
          groupStatus: parseInt(parts[3]),
          asOfDate: parts[4],
          asOfTime: parts[5],
          currencyCode: parts[6],
          asOfDateModifier: parseInt(parts[7]),
          groupControlTotal: undefined,
          numberOfAccounts: undefined,
          numberOfRecords: undefined,
          Accounts: []
        };
        inSummary = false;
        inDetail = false;
        currentAccount = null;
        currentDetails = null;
        currentDetail = null;
        break;
      case '03':
        if (currentAccount) {
          if (currentDetails && currentDetails.length > 0) {
            currentAccount.Details = currentDetails;
          }
          currentGroup.Accounts.push(currentAccount);
        }
        let currencyCode = parts[2];
        if (currencyCode.endsWith('/')) currencyCode = currencyCode.slice(0, -1);
        currentAccount = {
          accountNumber: parts[1],
          currencyCode: currencyCode,
          summaries: [],
          accountControlTotal: undefined,
          numberRecords: undefined,
          Details: null
        };
        inSummary = true;
        inDetail = false;
        currentDetails = [];
        currentDetail = null;
        break;
      case '88':
        if (inSummary && !inDetail) {
          let typeCode = parts[1];
          let amount = parts[2];
          let itemCount = parts[3] ? parseInt(parts[3]) : 0;
          let fundsType = {};
          currentAccount.summaries.push({
            TypeCode: typeCode,
            Amount: amount,
            ItemCount: itemCount,
            FundsType: fundsType
          });
        } else if (inDetail && currentDetail) {
          let text = parts.slice(1).join(',');
          if (currentDetail.Text.endsWith('/')) {
            currentDetail.Text = currentDetail.Text.slice(0, -1);
          }
          currentDetail.Text += text + '/';
        }
        break;
      case '16':
        inSummary = false;
        inDetail = true;
        let typeCode = parts[1];
        let amount = parts[2];
        let fundsType = { type_code: parts[3] };
        let bankRef = parts[4];
        let custRef = parts[5] || '';
        let text = parts.slice(6).join(',');
        currentDetail = {
          TypeCode: typeCode,
          Amount: amount,
          FundsType: fundsType,
          BankReferenceNumber: bankRef,
          CustomerReferenceNumber: custRef,
          Text: text.endsWith('/') ? text : text + '/'
        };
        currentDetails.push(currentDetail);
        break;
      case '49':
        if (currentAccount) {
          currentAccount.accountControlTotal = parts[1];
          currentAccount.numberRecords = parseInt(parts[2]);
          if (currentDetails && currentDetails.length > 0) {
            currentAccount.Details = currentDetails;
          }
          currentGroup.Accounts.push(currentAccount);
          currentAccount = null;
          currentDetails = null;
          currentDetail = null;
          inSummary = false;
          inDetail = false;
        }
        break;
      case '98':
        if (currentGroup) {
          currentGroup.groupControlTotal = parts[1];
          currentGroup.numberOfAccounts = parseInt(parts[2]);
          currentGroup.numberOfRecords = parseInt(parts[3]);
          groups.push(currentGroup);
          currentGroup = null;
          currentAccount = null;
          currentDetails = null;
          currentDetail = null;
          inSummary = false;
          inDetail = false;
        }
        break;
      case '99':
        result.fileControlTotal = parts[1];
        result.numberOfGroups = parseInt(parts[2]);
        result.numberOfRecords = parseInt(parts[3]);
        break;
    }
  }
  if (currentAccount) {
    if (currentDetails && currentDetails.length > 0) {
      currentAccount.Details = currentDetails;
    }
    if (currentGroup) currentGroup.Accounts.push(currentAccount);
  }
  if (currentGroup) groups.push(currentGroup);

  result.Groups = groups;
  return result;
}

// 按指定顺序输出对象字段
function orderedStringify(obj) {
  if (Array.isArray(obj)) {
    return '[' + obj.map(orderedStringify).join(',') + ']';
  } else if (obj && typeof obj === 'object') {
    // 判断是 group/account
    if (obj.Accounts && Array.isArray(obj.Accounts)) {
      // group
      let keys = groupOrder.filter(k => k in obj);
      let str = '{';
      for (let i = 0; i < keys.length; i++) {
        if (i > 0) str += ',';
        str += JSON.stringify(keys[i]) + ':' + orderedStringify(obj[keys[i]]);
      }
      str += '}';
      return str;
    } else if (obj.summaries && Array.isArray(obj.summaries)) {
      // account
      let keys = accountOrder.filter(k => k in obj);
      let str = '{';
      for (let i = 0; i < keys.length; i++) {
        if (i > 0) str += ',';
        str += JSON.stringify(keys[i]) + ':' + orderedStringify(obj[keys[i]]);
      }
      str += '}';
      return str;
    } else {
      // 普通对象
      let keys = Object.keys(obj);
      let str = '{';
      for (let i = 0; i < keys.length; i++) {
        if (i > 0) str += ',';
        str += JSON.stringify(keys[i]) + ':' + orderedStringify(obj[keys[i]]);
      }
      str += '}';
      return str;
    }
  } else {
    return JSON.stringify(obj);
  }
}

// Main
if (process.argv.length < 4) {
  console.error('Usage: node bai2_format.js <input.bai2> <output.json>');
  process.exit(1);
}

const inputFile = process.argv[2];
const outputFile = process.argv[3];

const content = fs.readFileSync(inputFile, 'utf8');
const lines = content.split(/\r?\n/);

const jsonObj = parseBAI2(lines);

fs.writeFileSync(outputFile, orderedStringify(jsonObj));
