const db = require('../electron/database');

async function main() {
  try {
    await db.initDatabase();
    const result = db.seedDemoData();
    if (result.seeded) {
      console.log(`Demo seed inserted ${result.inserted} sample dispatch records.`);
    } else {
      console.log(`Demo seed skipped: ${result.reason}.`);
    }
    process.exit(0);
  } catch (error) {
    console.error('Demo seed failed.');
    console.error(error);
    process.exit(1);
  }
}

main();
