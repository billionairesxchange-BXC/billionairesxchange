const fs = require('fs');
const path = require('path');
const solc = require('solc');

const contractPath = path.join(__dirname, '..', 'contracts', 'FixedSupplyERC20.sol');
const source = fs.readFileSync(contractPath, 'utf8');
const input = {
  language: 'Solidity',
  sources: {
    'FixedSupplyERC20.sol': { content: source }
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'paris',
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object']
      }
    }
  }
};

function findImport(importPath) {
  const resolvedPath = path.join(__dirname, '..', 'node_modules', importPath);
  try {
    return { contents: fs.readFileSync(resolvedPath, 'utf8') };
  } catch (error) {
    return { error: `Unable to resolve Solidity import "${importPath}": ${error.message}` };
  }
}

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
const errors = (output.errors || []).filter((entry) => entry.severity === 'error');
if (errors.length) {
  errors.forEach((entry) => console.error(entry.formattedMessage));
  process.exitCode = 1;
} else {
  const contract = output.contracts['FixedSupplyERC20.sol'].FixedSupplyERC20;
  const artifact = {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`
  };
  const artifactPath = path.join(__dirname, '..', 'contracts', 'erc20-artifact.js');
  fs.writeFileSync(artifactPath, `export const erc20Artifact = ${JSON.stringify(artifact)};\n`);
  console.log(`Compiled FixedSupplyERC20 to ${path.relative(process.cwd(), artifactPath)}`);
}
