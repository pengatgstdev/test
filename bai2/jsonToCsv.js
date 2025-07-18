const fs = require('fs');

const jsonData = require('./output/SimplyConnect-58-2715093-2025-07-11.json');
let outputFile = './output/SimplyConnect-58-2715093-2025-07-11.csv'

// const jsonData = require('./output/SimplyConnect-58-2715093-2025-07-14.json');
// let outputFile = './output/SimplyConnect-58-2715093-2025-07-14.csv'

// 142: 存款
// 195: 支票付款
// 201: 转账(来自)
// 451: 直接存款
// 475: 其他存款
// 495: 其他付款
// 501: 转账(至)

const depositType = ['142', '451', '475'];
const paymentType = ['201', '495', '501'];

let headerRow = ['Account Number', 'Transaction Date', 'Description', 'Payee', 'Category Or Match', 'Spent', 'Received'];
let data = [headerRow];

(jsonData?.Groups || []).map(group => {
  (group?.Accounts || []).map(account => {

    (account?.Details || []).map(transaction => {
      let spent = '';
      let received = '';
      
      if (depositType.includes(transaction?.TypeCode)) {
        spent = transaction.Amount;
      }

      if (paymentType.includes(transaction?.TypeCode)) {
        received = transaction.Amount;
      }

      data.push([account.accountNumber, group.asOfDate, transaction.Text, '', '', spent, received]);
    })
  })
})

// console.log(data)
const csvContent = data.map(row => row.join(',')).join('\n');

fs.writeFileSync(outputFile, csvContent, 'utf8');

console.log('CSV 文件已生成: ' + outputFile);