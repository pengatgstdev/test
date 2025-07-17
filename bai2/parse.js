const fs = require('fs');
const readline = require('readline');

class Bai2Parser {
  constructor(options = {}) {
    this.options = options;
    this.reset();
  }

  reset() {
    this.sender = '';
    this.receiver = '';
    this.fileCreatedDate = '';
    this.fileCreatedTime = '';
    this.fileIdNumber = '';
    this.physicalRecordLength = 0;
    this.blockSize = 0;
    this.versionNumber = 0;
    this.fileControlTotal = '';
    this.numberOfGroups = 0;
    this.numberOfRecords = 0;
    this.groups = [];
  }

  async parseFile(inputPath) {
    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lines = [];
    for await (const line of rl) {
      lines.push(line);
    }

    let currentLineIndex = 0;
    const getNextLine = () => {
      return currentLineIndex < lines.length ? lines[currentLineIndex++] : '';
    };

    const scanLine = () => {
      let line = getNextLine().trim();
      if (!line) return line;

      // Handle continuation lines
      while (currentLineIndex < lines.length) {
        const nextLine = lines[currentLineIndex].trim();
        const nextThreeBytes = nextLine.substring(0, 3);
        const headerCodes = ['01,', '02,', '03,', '16,', '49,', '88,', '98,', '99,'];

        if (headerCodes.includes(nextThreeBytes)) {
          break;
        }

        if (nextLine) {
          line += nextLine;
          currentLineIndex++;
        } else {
          break;
        }
      }

      return line;
    };

    for (let line = scanLine(); line; line = scanLine()) {
      if (line.length < 3) continue;

      const recordCode = line.substring(0, 2);

      try {
        switch (recordCode) {
          case '01': // File header
            this.parseFileHeader(line);
            break;
          case '02': // Group header
            const group = this.parseGroup(scanLine, line);
            this.groups.push(group);
            break;
          case '99': // File trailer
            this.parseFileTrailer(line);
            return; // End of file
        }
      } catch (err) {
        throw new Error(`Error parsing line ${currentLineIndex}: ${err.message}`);
      }
    }
  }

  parseFileHeader(line) {
    const parts = line.split(',');
    if (parts.length < 8) throw new Error('Invalid file header format');

    this.sender = parts[1];
    this.receiver = parts[2];
    this.fileCreatedDate = parts[3];
    this.fileCreatedTime = parts[4];
    this.fileIdNumber = parts[5];
    this.physicalRecordLength = parseInt(parts[6]) || 0;
    this.blockSize = parseInt(parts[7]) || 0;
    this.versionNumber = parseInt(parts[8]) || 0;
  }

  parseGroup(scanLine, firstLine) {
    const group = {
      receiver: '',
      originator: '',
      groupStatus: 0,
      asOfDate: '',
      asOfTime: '',
      currencyCode: '',
      asOfDateModifier: 0,
      groupControlTotal: '',
      numberOfAccounts: 0,
      numberOfRecords: 0,
      accounts: []
    };

    // Parse group header
    const headerParts = firstLine.split(',');
    // if (headerParts.length < 9) throw new Error('Invalid group header format');

    group.receiver = headerParts[1];
    group.originator = headerParts[2];
    group.groupStatus = parseInt(headerParts[3]) || 0;
    group.asOfDate = headerParts[4];
    group.asOfTime = headerParts[5];
    group.currencyCode = headerParts[6];
    group.asOfDateModifier = parseInt(headerParts[7]) || 0;

    // Parse accounts
    let line = scanLine();
    while (line && !line.startsWith('98,')) {
      if (line.startsWith('03,')) {
        const account = this.parseAccount(scanLine, line);
        group.accounts.push(account);
      }
      line = scanLine();
    }

    // Parse group trailer
    if (line && line.startsWith('98,')) {
      const trailerParts = line.split(',');
      if (trailerParts.length >= 3) {
        group.groupControlTotal = trailerParts[1];
        group.numberOfAccounts = parseInt(trailerParts[2]) || 0;
        group.numberOfRecords = parseInt(trailerParts[3]) || 0;
      }
    }

    return group;
  }

  parseAccount(scanLine, firstLine) {
    const account = {
      accountNumber: '',
      currencyCode: '',
      summaries: [],
      accountControlTotal: '',
      numberRecords: 0,
      details: []
    };

    // Parse account identifier
    const idParts = firstLine.split(',');
    if (idParts.length < 3) throw new Error('Invalid account identifier format');

    account.accountNumber = idParts[1];
    account.currencyCode = idParts[2];

    // Parse account details
    let line = scanLine();
    while (line && !line.startsWith('49,')) {
      if (line.startsWith('16,')) {
        const detail = this.parseTransactionDetail(line);
        account.details.push(detail);
      } else if (line.startsWith('88,')) {
        if (account.details.length > 0) {
          const lastDetail = account.details[account.details.length - 1];
          lastDetail.Text += ' ' + line.substring(3).replace(/\/$/, '').trim();
        }
      } else if (line.startsWith('88,')) {
        const summary = this.parseSummaryRecord(line);
        if (summary) {
          account.summaries.push(summary);
        }
      }
      line = scanLine();
    }

    // Parse account trailer
    if (line && line.startsWith('49,')) {
      const trailerParts = line.split(',');
      if (trailerParts.length >= 3) {
        account.accountControlTotal = trailerParts[1];
        account.numberRecords = parseInt(trailerParts[2]) || 0;
      }
    }

    return account;
  }

  parseTransactionDetail(line) {
    const parts = line.split(',');
    if (parts.length < 5) throw new Error('Invalid transaction detail format');

    return {
      TypeCode: parts[1],
      Amount: parts[2],
      FundsType: { type_code: parts[3] || '0' },
      BankReferenceNumber: parts[4] || '',
      CustomerReferenceNumber: parts[5] || '',
      Text: parts.slice(6).join(',').replace(/\/$/, '') || ''
    };
  }

  parseSummaryRecord(line) {
    const parts = line.split(',');
    if (parts.length < 2 || !['10', '15', '20', '25', '40', '45', '50', '55', '72', '74', '75', '100', '102', '110', '400', '402'].includes(parts[0])) {
      return null;
    }

    return {
      TypeCode: parts[0],
      Amount: parts[1] || '0',
      ItemCount: parseInt(parts[2]) || 0,
      FundsType: {}
    };
  }

  parseFileTrailer(line) {
    const parts = line.split(',');
    if (parts.length < 4) throw new Error('Invalid file trailer format');

    this.fileControlTotal = parts[1];
    this.numberOfGroups = parseInt(parts[2]) || 0;
    this.numberOfRecords = parseInt(parts[3]) || 0;
  }

  toJSON() {
    return {
      sender: this.sender,
      receiver: this.receiver,
      fileCreatedDate: this.fileCreatedDate,
      fileCreatedTime: this.fileCreatedTime,
      fileIdNumber: this.fileIdNumber,
      physicalRecordLength: this.physicalRecordLength,
      blockSize: this.blockSize,
      versionNumber: this.versionNumber,
      fileControlTotal: this.fileControlTotal,
      numberOfGroups: this.numberOfGroups,
      numberOfRecords: this.numberOfRecords,
      Groups: this.groups
    };
  }
}

// 使用示例
async function main() {
  const parser = new Bai2Parser();
  await parser.parseFile('/home/eng/Downloads/SimplyConnect-58-2715093-2025-07-11.bai2');
  console.log(JSON.stringify(parser.toJSON(), null, 2));
}

main().catch(console.error);