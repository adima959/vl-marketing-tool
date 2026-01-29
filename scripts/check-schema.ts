import { executeMariaDBQuery } from '@/lib/server/mariadb';

async function checkSchema() {
  try {
    console.log('Checking customer table schema...');
    const customerCols = await executeMariaDBQuery('DESCRIBE customer', []);
    console.log('Customer table columns:', JSON.stringify(customerCols, null, 2));

    console.log('\nChecking subscription table schema...');
    const subscriptionCols = await executeMariaDBQuery('DESCRIBE subscription', []);
    console.log('Subscription table columns:', JSON.stringify(subscriptionCols, null, 2));

    console.log('\nChecking invoice table schema...');
    const invoiceCols = await executeMariaDBQuery('DESCRIBE invoice', []);
    console.log('Invoice table columns:', JSON.stringify(invoiceCols, null, 2));

    console.log('\nSample customer data...');
    const sampleCustomer = await executeMariaDBQuery('SELECT * FROM customer LIMIT 1', []);
    console.log('Sample customer:', JSON.stringify(sampleCustomer, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

checkSchema();
