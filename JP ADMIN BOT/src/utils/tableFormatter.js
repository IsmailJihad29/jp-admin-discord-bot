/**
 * JP ADMIN — Table & Text Formatter Utility
 */

class TableFormatter {
  static toTSV(headers, rows) {
    let result = headers.join('\t') + '\n';
    rows.forEach(row => {
      result += row.map(val => (val !== undefined && val !== null ? String(val).replace(/\t|\n/g, ' ') : '')).join('\t') + '\n';
    });
    return result;
  }

  static toMarkdownTable(headers, rows) {
    if (!headers || headers.length === 0) return "";
    const colWidths = headers.map((h, i) => {
      let max = h.length;
      rows.forEach(r => {
        const len = String(r[i] || '').length;
        if (len > max) max = len;
      });
      return Math.min(max, 30); // Cap at 30 chars
    });

    const headerLine = "| " + headers.map((h, i) => h.padEnd(colWidths[i])).join(" | ") + " |";
    const separatorLine = "| " + colWidths.map(w => "-".repeat(w)).join(" | ") + " |";
    const bodyLines = rows.map(r => {
      return "| " + r.map((cell, i) => String(cell || '').substring(0, 30).padEnd(colWidths[i])).join(" | ") + " |";
    });

    return [headerLine, separatorLine, ...bodyLines].join("\n");
  }
}

module.exports = TableFormatter;
