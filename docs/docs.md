 
 el new RegExp(tag, 'i') crea una expresión regular que busca cualquier string que contenga esa secuencia, no que sea exactamente igual.

 // ✅ También correcto - coincidencia exacta pero insensible a mayúsculas
tag: new RegExp(`^${tag}$`, 'i'),