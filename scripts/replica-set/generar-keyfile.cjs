/**
 * Genera el keyfile que MongoDB usa para la autenticación interna entre
 * miembros del replica set.
 *
 * Equivale a `openssl rand -base64 756`, pero sin depender de openssl en
 * Windows. MongoDB acepta entre 6 y 1024 caracteres del alfabeto base64.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const destino = path.join(__dirname, 'keyfile');

if (fs.existsSync(destino)) {
  console.log('Ya existe un keyfile en:', destino);
  console.log('No se sobrescribe: cambiarlo obligaria a reiniciar el conjunto.');
  console.log('Si de verdad quieres uno nuevo, borra el actual y vuelve a ejecutar.');
  process.exit(0);
}

// 756 bytes aleatorios -> 1008 caracteres base64, dentro del limite de 1024.
const clave = crypto.randomBytes(756).toString('base64');

// Sin salto de linea final: algunas versiones de MongoDB lo cuentan como
// parte de la clave y luego no coincide entre miembros.
fs.writeFileSync(destino, clave, { mode: 0o400 });

console.log('keyfile generado en:', destino);
console.log('longitud:', clave.length, 'caracteres');
console.log('');
console.log('IMPORTANTE: es una credencial. No lo subas al repositorio.');
console.log('Anade esta linea a .gitignore:');
console.log('  scripts/replica-set/keyfile');
