/**
 * Parse a CSV file into an array of objects keyed by header names.
 * @param {File} file - The CSV file to parse
 * @returns {Promise<Array<Object>>} Parsed rows
 */
export function parseCsvFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                const text = event.target.result;
                const lines = text
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0);

                if (lines.length < 2) {
                    reject(new Error('CSV file must have a header row and at least one data row'));
                    return;
                }

                const headers = lines[0].split(',').map((h) => h.trim());
                const rows = [];

                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',').map((v) => v.trim());
                    const row = {};
                    headers.forEach((header, index) => {
                        row[header] = values[index] || '';
                    });
                    rows.push(row);
                }

                resolve(rows);
            } catch (err) {
                reject(new Error(`Failed to parse CSV: ${err.message}`));
            }
        };

        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };

        reader.readAsText(file);
    });
}
