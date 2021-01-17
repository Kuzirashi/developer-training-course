"use strict";

const {initializeConfig} = require("@ckb-lumos/config-manager");
const {addressToScript, TransactionSkeleton} = require("@ckb-lumos/helpers");
const {addDefaultCellDeps, addDefaultWitnessPlaceholders, collectCapacity, initializeLumosIndexer, sendTransaction, signTransaction, waitForTransactionConfirmation} = require("../lib/index.js");
const {ckbytesToShannons, hexToInt, intToHex} = require("../lib/util.js");
const {describeTransaction, initializeLab, validateLab} = require("./lab.js");

// Nervos CKB Development Blockchain URL.
const nodeUrl = "http://127.0.0.1:8114/";

// This is the private key and address which will be used.
const privateKey = "0x67842f5e4fa0edb34c9b4adbe8c3c1f3c737941f7c875d18bc6ec2f80554111d";
const address = "ckt1qyqf3z5u8e6vp8dtwmywg82grfclf5mdwuhsggxz4e";

// This is the TX fee amount that will be paid in Shannons.
const txFee = 100_000n;

async function main()
{
	// Initialize the Lumos configuration which is held in config.json.
	initializeConfig();

	// Start the Lumos Indexer and wait until it is fully synchronized.
	const indexer = await initializeLumosIndexer(nodeUrl);

	// Create a transaction skeleton.
	let transaction = TransactionSkeleton({cellProvider: indexer});

	// Add the cell dep for the lock script.
	transaction = addDefaultCellDeps(transaction);

	// Initialize our lab.
	await initializeLab(nodeUrl, indexer);

	// Create a Cell with a capacity large enough for the data being placed in it.
	const hexString = "0x48656c6c6f204e6572766f7321"; // "Hello Nervos!" as a hex string.
	const dataSize = ((hexString.length - 2) / 2); // Calculate the size of hexString as binary.
	const outputCapacity1 = intToHex(ckbytesToShannons(61n) + ckbytesToShannons(dataSize)); // 61 CKBytes for the Cell minimum + the size of the data.
	const output1 = {cell_output: {capacity: outputCapacity1, lock: addressToScript(address), type: null}, data: hexString};
	transaction = transaction.update("outputs", (i)=>i.push(output1));

	// Add the input cell to the transaction.
	const capacityRequired = hexToInt(outputCapacity1) + ckbytesToShannons(61n) + txFee; // output1 + minimum for a change cell + tx fee
	const {inputCells} = await collectCapacity(indexer, addressToScript(address), capacityRequired);
	transaction = transaction.update("inputs", (i)=>i.concat(inputCells));

	// Get the capacity sums of the inputs and outputs.
	const inputCapacity = transaction.inputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);
	const outputCapacity = transaction.outputs.toArray().reduce((a, c)=>a+hexToInt(c.cell_output.capacity), 0n);

	// Create a change Cell for the remaining CKBytes.
	const outputCapacity2 = intToHex(inputCapacity - outputCapacity - txFee);
	const output2 = {cell_output: {capacity: outputCapacity2, lock: addressToScript(address), type: null}, data: "0x"};
	transaction = transaction.update("outputs", (i)=>i.push(output2));	

	// Add in the witness placeholders.
	transaction = addDefaultWitnessPlaceholders(transaction);

	// Print the details of the transaction to the console.
	describeTransaction(transaction.toJS());

	// Validate the transaction against the lab requirements.
	await validateLab(transaction);

	// Sign the transaction.
	const signedTx = signTransaction(transaction, privateKey);

	// Send the transaction to the RPC node.
	const txid = await sendTransaction(nodeUrl, signedTx);
	console.log(`Transaction Sent: ${txid}\n`);

	// Wait for the transaction to confirm.
	await waitForTransactionConfirmation(nodeUrl, txid);
	console.log("\n");

	console.log("Example completed successfully!");
}
main();
