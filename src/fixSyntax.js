const fs = require('fs');
let c = fs.readFileSync('Login.jsx', 'utf8');
c = c.replace(/title:\s*\}/g, "title: 'Notification' }");
fs.writeFileSync('Login.jsx', c);
console.log('Login.jsx fixed');

let css = fs.readFileSync('AdminPanel.css', 'utf8');
css = css.replace(/\.\s*s\s*m\s*a\s*l\s*l\s*-\s*p\s*r\s*o\s*m\s*p\s*t\s*-\s*m\s*o\s*d\s*a\s*l\s*[\s\S]*?(?=\n|$)/g, '');
fs.writeFileSync('AdminPanel.css', css);
console.log('AdminPanel.css fixed');
