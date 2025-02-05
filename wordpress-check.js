#!/usr/bin/env node
/**
 * Script de verificação de sites WordPress com interface interativa
 * utilizando Blessed e Blessed-Contrib para uma UI moderna.
 *
 * Para cada site (lido do arquivo "links.txt"), são realizadas as seguintes verificações:
 *  1. Verificar disponibilidade do site (usando 5 métodos).
 *  2. Medir o tempo de resposta.
 *  3. Verificar redirecionamentos.
 *  4. Verificar certificado SSL (para URLs HTTPS).
 *  5. Verificar a resolução DNS do domínio.
 *  6. Executar teste de ping.
 *  7. Obter o cabeçalho Content-Type.
 *  8. Extrair o título da página.
 *  9. Analisar o conteúdo em busca de erros.
 * 10. Verificar a existência de robots.txt.
 * 11. Verificar a existência de sitemap.xml.
 * 12. Verificar a presença de meta refresh.
 * 13. Executar verificações específicas para WordPress (ex.: presença de wp-content, wp-includes, meta tag generator, endpoints /wp-json/ e /wp-admin/).
 * 14. Salvar o conteúdo (controle de versões).
 * 15. Medir o desempenho (score).
 * 16. Capturar screenshot da página inicial (usando Puppeteer) e tentar abri-la automaticamente.
 *
 * A interface apresenta:
 * - À esquerda: uma lista de sites processados.
 * - À direita: os detalhes completos do site selecionado.
 * - No rodapé: um log de progresso.
 *
 * Navegue na lista com as setas; pressione Enter (ou clique) para selecionar um site; use as setas direita/esquerda para alternar o foco entre a lista e os detalhes; para sair, pressione ESC, "q" ou Ctrl+C.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const chalk = require('chalk').default;
const { exec } = require('child_process');
const dns = require('dns').promises;
const crypto = require('crypto');
const { performance } = require('perf_hooks');
const net = require('net');
const tls = require('tls');
const puppeteer = require('puppeteer');

// Importa blessed e blessed-contrib
const blessed = require('blessed');
const contrib = require('blessed-contrib');

// --- Configuração da Interface ---

// Cria a tela principal
const screen = blessed.screen({
  smartCSR: true,
  title: 'Verificação de Sites WordPress'
});

// Cria um grid com 12 linhas x 12 colunas
const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

// Cabeçalho: 3 linhas, toda a largura
const header = grid.set(0, 0, 3, 12, blessed.box, {
  content: printHeader() + "\nIniciando verificação dos sites",
  tags: true,
  border: { type: 'line', fg: 'cyan' },
  style: { fg: 'cyan', bold: true }
});

// Painel Esquerdo: Lista de Sites (6 linhas, 25% da largura)
const siteList = grid.set(3, 0, 8, 3, blessed.list, {
  label: 'Sites',
  border: { type: 'line', fg: 'blue' },
  keys: true,
  vi: true,
  mouse: true,
  style: {
    selected: { bg: 'blue' },
    border: { fg: 'blue' }
  }
});

// Painel Direito: Detalhes do Site (6 linhas, 75% da largura)
const detailsBox = grid.set(3, 3, 8, 9, blessed.box, {
  label: 'Detalhes do Site',
  border: { type: 'line', fg: 'magenta' },
  scrollable: true,
  alwaysScroll: true,
  keys: true,
  vi: true,
  mouse: true,
  scrollbar: { ch: ' ', inverse: true },
  content: 'Aguardando seleção...',
  tags: true
});

// Rodapé: Log de Progresso (3 linhas, 100% da largura)
const logBox = grid.set(11, 0, 1, 12, blessed.log, {
  label: 'Progresso',
  tags: true,
  border: { type: 'line', fg: 'green' },
  style: { fg: 'white', border: { fg: 'green' } },
  scrollable: true,
  alwaysScroll: true
});

// Renderiza a tela inicial
screen.render();

// --- Funções de Log e Atualização ---
function logProgress(message) {
  logBox.log(message);
  screen.render();
}

function updateDetails(text) {
  detailsBox.setContent(text);
  screen.render();
}

function updateSiteList(url) {
  if (!siteList.items.find(item => item.getText() === url)) {
    siteList.addItem(url);
    screen.render();
  }
}

// Permite alternar o foco entre os painéis com as setas direita e esquerda
siteList.key(['right'], function() {
  detailsBox.focus();
});
detailsBox.key(['left'], function() {
  siteList.focus();
});

// --- Função para criar hyperlink OSC 8 (para terminais compatíveis) ---
function makeHyperlink(filePath, text) {
  const normalizedPath = filePath.split(path.sep).join('/');
  return `\u001b]8;;file:///${normalizedPath}\u0007${text}\u001b]8;;\u0007`;
}

// --- Funções Auxiliares de Verificação (as mesmas de versões anteriores) ---
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hashContent(data) {
  return crypto.createHash('md5').update(data).digest('hex');
}

function criarPastas(domain) {
  const baseFolder = 'dominios';
  if (!fs.existsSync(baseFolder)) fs.mkdirSync(baseFolder);
  const domainPath = path.join(baseFolder, domain);
  if (!fs.existsSync(domainPath)) fs.mkdirSync(domainPath);
  return domainPath;
}

function contarVersoes(domainPath, dateBase) {
  let count = 0;
  const files = fs.readdirSync(domainPath);
  for (const file of files) {
    if (file.startsWith(dateBase) && file.endsWith('.html')) count++;
  }
  return count;
}

function getLastVersionFile(domainPath, dateBase) {
  let versions = [];
  const files = fs.readdirSync(domainPath);
  for (const file of files) {
    if (file.startsWith(dateBase) && file.endsWith('.html')) {
      const num = file === `${dateBase}.html` ? 0 : parseInt(file.replace(dateBase + '_', '').replace('.html', ''), 10) || 0;
      versions.push({ num, file });
    }
  }
  if (!versions.length) return null;
  versions.sort((a, b) => a.num - b.num);
  return versions[versions.length - 1].file;
}

function salvarConteudo(domainPath, content) {
  const hoje = new Date().toISOString().slice(0,10);
  const now = Date.now();
  const threshold = 600000;
  const lastFile = getLastVersionFile(domainPath, hoje);
  if (lastFile) {
    const lastFilePath = path.join(domainPath, lastFile);
    const stats = fs.statSync(lastFilePath);
    if ((now - stats.mtimeMs) < threshold) {
      return { savedFile: null, totalVersoes: contarVersoes(domainPath, hoje) };
    }
    const existingContent = fs.readFileSync(lastFilePath);
    if (hashContent(existingContent) === hashContent(content)) {
      return { savedFile: null, totalVersoes: contarVersoes(domainPath, hoje) };
    } else {
      let novoNome = lastFile === `${hoje}.html` ? `${hoje}_1.html` : `${hoje}_${parseInt(lastFile.replace(hoje + '_', '').replace('.html', ''),10)+1}.html`;
      fs.writeFileSync(path.join(domainPath, novoNome), content);
      return { savedFile: novoNome, totalVersoes: contarVersoes(domainPath, hoje) };
    }
  } else {
    const novoNome = `${hoje}.html`;
    fs.writeFileSync(path.join(domainPath, novoNome), content);
    return { savedFile: novoNome, totalVersoes: contarVersoes(domainPath, hoje) };
  }
}

function printHeader() {
  return `
    ### ###  ### ###  ### ##     ####   ### ###  ##  ##             ## ##     ####   #### ##  ### ###   ## ##
     ##  ##   ##  ##   ##  ##     ##     ##  ##  ##  ##            ##   ##     ##    # ## ##   ##  ##  ##   ##
     ##  ##   ##       ##  ##     ##     ##      ##  ##            ####        ##      ##      ##      ####
     ##  ##   ## ##    ## ##      ##     ## ##    ## ##             #####      ##      ##      ## ##    #####
     ### ##   ##       ## ##      ##     ##        ##                  ###     ##      ##      ##          ###
      ###     ##  ##   ##  ##     ##     ##        ##              ##   ##     ##      ##      ##  ##  ##   ##
       ##    ### ###  #### ##    ####   ####       ##               ## ##     ####    ####    ### ###   ## ##
  `;
}

// --- Funções de Verificação ---
async function verificarSite(url) {
  let onlineResults = [];
  let content = null;
  try {
    const r1 = await axios.get(url, { timeout: 10000 });
    onlineResults.push(r1.status === 200);
    if (r1.status === 200 && !content) content = r1.data;
  } catch (e) { onlineResults.push(false); }
  try {
    const r2 = await axios.head(url, { timeout: 10000 });
    onlineResults.push(r2.status < 400);
  } catch (e) { onlineResults.push(false); }
  try {
    const r3 = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
    onlineResults.push(r3.status === 200);
    if (r3.status === 200 && !content) content = r3.data;
  } catch (e) { onlineResults.push(false); }
  try {
    const urlBarra = url.endsWith('/') ? url : url + '/';
    const r4 = await axios.get(urlBarra, { timeout: 10000 });
    onlineResults.push(r4.status === 200);
    if (r4.status === 200 && !content) content = r4.data;
  } catch (e) { onlineResults.push(false); }
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    let socketSuccess = false;
    for (const port of [80, 443]) {
      try {
        await new Promise((resolve, reject) => {
          const socket = net.createConnection(port, hostname, () => {
            socket.end();
            socketSuccess = true;
            resolve();
          });
          socket.on('error', reject);
        });
        if (socketSuccess) break;
      } catch (e) { continue; }
    }
    onlineResults.push(socketSuccess);
  } catch (e) { onlineResults.push(false); }
  return { online: onlineResults.some(r => r), content };
}

async function checkResponseTime(url) {
  try {
    const start = performance.now();
    const response = await axios.get(url, { timeout: 10000 });
    const end = performance.now();
    return { respTime: (end - start) / 1000, response };
  } catch (e) {
    return { respTime: null, response: null };
  }
}

async function checkRedirectionChain(url) {
  let chain = [];
  let currentUrl = url;
  for (let i = 0; i < 10; i++) {
    try {
      const response = await axios.head(currentUrl, {
        timeout: 10000,
        maxRedirects: 0,
        validateStatus: status => status >= 300 && status < 400
      });
      const location = response.headers.location;
      if (location) {
        chain.push(location);
        currentUrl = new URL(location, currentUrl).href;
      } else break;
    } catch (e) { break; }
  }
  return chain;
}

function checkSSLCertificate(hostname, port = 443) {
  return new Promise((resolve) => {
    const socket = tls.connect(port, hostname, { rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert && cert.valid_to ? { valid: true, expiry: cert.valid_to } : { valid: false, expiry: null });
    });
    socket.on('error', () => resolve({ valid: false, expiry: null }));
  });
}

async function checkDNSResolution(domain) {
  try {
    const ips = await dns.resolve(domain);
    return ips;
  } catch (e) { return []; }
}

function pingHost(domain) {
  return new Promise((resolve) => {
    const param = process.platform === 'win32' ? '-n' : '-c';
    exec(`ping ${param} 1 ${domain}`, (error) => {
      resolve(!error);
    });
  });
}

function getContentType(response) {
  return (response && response.headers && response.headers['content-type']) || 'N/A';
}

function getPageTitle(content) {
  try {
    const $ = cheerio.load(content);
    return $('title').text().trim() || 'N/A';
  } catch (e) { return 'N/A'; }
}

function checkErrorPatterns(content) {
  const errorKeywords = ["404", "not found", "error", "503", "maintenance"];
  let text = (typeof content === 'string') ? content.toLowerCase() : (Buffer.isBuffer(content) ? content.toString('utf8').toLowerCase() : "");
  return errorKeywords.filter(word => text.includes(word));
}

async function checkRobotsTxt(url) {
  try {
    const parsed = new URL(url);
    const base = `${parsed.protocol}//${parsed.hostname}`;
    const res = await axios.get(base + '/robots.txt', { timeout: 10000 });
    return res.status === 200;
  } catch (e) { return false; }
}

async function checkSitemapXml(url) {
  try {
    const parsed = new URL(url);
    const base = `${parsed.protocol}//${parsed.hostname}`;
    const res = await axios.get(base + '/sitemap.xml', { timeout: 10000 });
    return res.status === 200;
  } catch (e) { return false; }
}

function checkMetaRefresh(content) {
  try {
    const $ = cheerio.load(content);
    return $('meta[http-equiv="refresh"]').length > 0;
  } catch (e) { return false; }
}

async function checkWordpressFeatures(content, baseUrl) {
  let features = {};
  let text = (typeof content === 'string') ? content.toLowerCase() : (Buffer.isBuffer(content) ? content.toString('utf8').toLowerCase() : "");
  features.wp_content = text.includes("wp-content");
  features.wp_includes = text.includes("wp-includes");
  features.meta_generator = false;
  try {
    const $ = cheerio.load(content);
    const meta = $('meta[name="generator"]').attr('content');
    if (meta && meta.toLowerCase().includes("wordpress")) features.meta_generator = true;
  } catch (e) { }
  try {
    const wpJsonUrl = baseUrl.replace(/\/+$/, "") + "/wp-json/";
    const res = await axios.get(wpJsonUrl, { timeout: 10000 });
    features.wp_json = (res.status === 200);
  } catch (e) { features.wp_json = false; }
  try {
    const wpAdminUrl = baseUrl.replace(/\/+$/, "") + "/wp-admin/";
    const res = await axios.get(wpAdminUrl, { timeout: 10000 });
    features.wp_admin = ((res.status === 200 || res.status === 302) && res.data.toLowerCase().includes("login"));
  } catch (e) { features.wp_admin = false; }
  return features;
}

function medirDesempenho(respTime) {
  if (respTime === null) return 0;
  if (respTime < 0.5) return 100;
  else if (respTime < 1) return 90;
  else if (respTime < 1.5) return 80;
  else if (respTime < 2) return 70;
  else if (respTime < 2.5) return 60;
  else return 50;
}

async function takeScreenshot(url, outputFile) {
  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.screenshot({ path: outputFile });
    await browser.close();
    return true;
  } catch (e) {
    return false;
  }
}

function computeScore(online, respTime, redirChain, url, sslValid, dnsIps, pingSuccess,
                      contentType, title, errorPatterns, robots, sitemap, metaRefresh) {
  let score = 0;
  if (online) score += 30;
  if (respTime !== null) {
    if (respTime < 1) score += 10;
    else if (respTime < 3) score += 5;
  }
  if (redirChain.length === 0) score += 10;
  else if (redirChain.length <= 2) score += 5;
  if (url.toLowerCase().startsWith("https")) {
    if (sslValid) score += 10;
  } else score += 5;
  if (dnsIps.length) score += 5;
  if (pingSuccess) score += 5;
  if (contentType.toLowerCase().includes("text/html")) score += 5;
  if (title !== "N/A") score += 5;
  if (errorPatterns.length === 0) score += 5;
  if (robots) score += 5;
  if (sitemap) score += 5;
  if (!metaRefresh) score += 5;
  return score;
}

// --- Armazenamento dos detalhes de cada site ---
const resultsBySite = {}; // { url: detalhes completos }

// Função para compor os detalhes completos de um site
function composeDetails(url, data) {
  const {
    online, respTime, redirChain, sslValid, sslExpiry, dnsIps, pingSuccess,
    contentType, pageTitle, erros, robots, sitemap, metaRefresh, wpFeatures,
    totalVersoes, performanceScore, screenshotFile
  } = data;
  const status = online ? chalk.green("ONLINE") : chalk.red("OFFLINE");
  const respTimeStr = respTime !== null
    ? (respTime < 1 ? chalk.green(`${respTime.toFixed(2)} s`)
       : respTime < 3 ? chalk.yellow(`${respTime.toFixed(2)} s`)
       : chalk.red(`${respTime.toFixed(2)} s`))
    : chalk.gray("N/A");
  const sslStr = url.toLowerCase().startsWith("https")
    ? (sslValid ? chalk.green(`Válido (expira: ${sslExpiry})`)
       : chalk.red("Inválido/N/A"))
    : chalk.gray("N/A");
  const dnsStr = dnsIps.length ? dnsIps.join(', ') : "N/A";
  const pingStr = pingSuccess ? chalk.green("Sucesso") : chalk.red("Falha");
  const contentTypeStr = chalk.white(contentType);
  const titleStr = chalk.white(pageTitle);
  const errosStr = erros.length ? chalk.red(erros.join(', ')) : chalk.green("Nenhum");
  const robotsStr = robots ? chalk.green("Encontrado") : chalk.hex('#FFA500')("Não encontrado");
  const sitemapStr = sitemap ? chalk.green("Encontrado") : chalk.hex('#FFA500')("Não encontrado");
  const metaRefreshStr = metaRefresh ? chalk.red("Detectado") : chalk.green("Não detectado");
  const desempenhoStr = performanceScore >= 90 ? chalk.bold.green(`${performanceScore}%`)
                        : performanceScore >= 70 ? chalk.bold.yellow(`${performanceScore}%`)
                        : chalk.bold.red(`${performanceScore}%`);
  const wpDetails = `
wp-content: ${wpFeatures.wp_content ? chalk.green("Encontrado") : chalk.red("Não encontrado")}
wp-includes: ${wpFeatures.wp_includes ? chalk.green("Encontrado") : chalk.red("Não encontrado")}
Meta Generator: ${wpFeatures.meta_generator ? chalk.green("WordPress detectado") : chalk.red("Não detectado")}
Endpoint /wp-json/: ${wpFeatures.wp_json ? chalk.green("Acessível") : chalk.red("Indisponível")}
Endpoint /wp-admin/: ${wpFeatures.wp_admin ? chalk.green("Página de Login Detectada") : chalk.red("Não detectada")}
  `;
  const printStr = screenshotFile ? screenshotFile : chalk.red("Erro no print");

  return `
Site: ${url}
--------------------------------------------------
1. Verificar disponibilidade: ${status}
2. Medir tempo de resposta: ${respTimeStr}
3. Redirecionamentos: ${redirChain.length} (${redirChain.join(' -> ') || 'Nenhum'})
4. Certificado SSL: ${sslStr}
5. Resolução DNS: ${dnsStr}
6. Teste de Ping: ${pingStr}
7. Content-Type: ${contentTypeStr}
8. Título: ${titleStr}
9. Erros no conteúdo: ${errosStr}
10. robots.txt: ${robotsStr}
11. sitemap.xml: ${sitemapStr}
12. Meta Refresh: ${metaRefreshStr}
13. Verificações específicas para WordPress:
${wpDetails}
14. Versões Salvas: ${chalk.hex('#FFA500')(totalVersoes.toString())}
15. Desempenho: ${desempenhoStr}
16. Print (Screenshot): ${printStr}
--------------------------------------------------
`;
}

// --- Função Principal ---
async function main() {
  // Atualiza o cabeçalho e renderiza
  header.setContent(printHeader() + "\nIniciando verificação dos sites");
  screen.render();

  const linksFile = 'links.txt';
  if (!fs.existsSync(linksFile)) {
    header.setContent("Arquivo de links 'links.txt' não encontrado!");
    screen.render();
    process.exit(1);
  }
  const links = fs.readFileSync(linksFile, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
  if (links.length === 0) {
    header.setContent("Nenhum link encontrado no arquivo.");
    screen.render();
    process.exit(1);
  }
  const totalStepsOverall = links.length * 16;
  let stepsCompleted = 0;

  for (const url of links) {
    logProgress(`Processando site: ${url} (${((stepsCompleted / totalStepsOverall) * 100).toFixed(2)}%)`);

    // Passo 1: Disponibilidade
    const { online, content } = await verificarSite(url);
    stepsCompleted++;
    logProgress(`Site: ${url} [Disponibilidade verificada]`);
    await sleep(100);

    // Passo 2: Tempo de Resposta
    const { respTime, response } = await checkResponseTime(url);
    stepsCompleted++;
    logProgress(`Site: ${url} [Tempo de resposta medido]`);
    await sleep(100);

    // Passo 3: Redirecionamentos
    const redirChain = await checkRedirectionChain(url);
    stepsCompleted++;
    logProgress(`Site: ${url} [Redirecionamentos verificados]`);
    await sleep(100);

    // Passo 4: Certificado SSL
    let sslValid = false, sslExpiry = null;
    if (url.toLowerCase().startsWith("https")) {
      const hostname = new URL(url).hostname;
      const sslInfo = await checkSSLCertificate(hostname);
      sslValid = sslInfo.valid;
      sslExpiry = sslInfo.expiry;
    }
    stepsCompleted++;
    logProgress(`Site: ${url} [Certificado SSL verificado]`);
    await sleep(100);

    // Passo 5: DNS
    const domain = new URL(url).hostname;
    const dnsIps = await checkDNSResolution(domain);
    stepsCompleted++;
    logProgress(`Site: ${url} [DNS verificado]`);
    await sleep(100);

    // Passo 6: Ping
    const pingSuccess = await pingHost(domain);
    stepsCompleted++;
    logProgress(`Site: ${url} [Ping realizado]`);
    await sleep(100);

    // Passo 7: Content-Type
    const contentType = getContentType(response);
    stepsCompleted++;
    logProgress(`Site: ${url} [Content-Type obtido]`);
    await sleep(100);

    // Passo 8: Título
    const pageTitle = getPageTitle(content);
    stepsCompleted++;
    logProgress(`Site: ${url} [Título extraído]`);
    await sleep(100);

    // Passo 9: Erros
    const erros = checkErrorPatterns(content);
    stepsCompleted++;
    logProgress(`Site: ${url} [Erros verificados]`);
    await sleep(100);

    // Passo 10: robots.txt
    const robots = await checkRobotsTxt(url);
    stepsCompleted++;
    logProgress(`Site: ${url} [robots.txt verificado]`);
    await sleep(100);

    // Passo 11: sitemap.xml
    const sitemap = await checkSitemapXml(url);
    stepsCompleted++;
    logProgress(`Site: ${url} [sitemap.xml verificado]`);
    await sleep(100);

    // Passo 12: Meta Refresh
    const metaRefresh = checkMetaRefresh(content);
    stepsCompleted++;
    logProgress(`Site: ${url} [Meta Refresh verificado]`);
    await sleep(100);

    // Passo 13: Verificações WordPress
    const baseUrl = url.startsWith("http") ? url : "http://" + url;
    const wpFeatures = await checkWordpressFeatures(content, baseUrl);
    stepsCompleted++;
    logProgress(`Site: ${url} [Verificações WordPress realizadas]`);
    await sleep(100);

    // Passo 14: Salvar conteúdo
    const domainPath = criarPastas(domain);
    const { savedFile, totalVersoes } = salvarConteudo(domainPath, typeof content === 'string' ? content : '');
    const novaVersao = savedFile ? chalk.green("Sim") : chalk.gray("Não");
    stepsCompleted++;
    logProgress(`Site: ${url} [Conteúdo salvo]`);
    await sleep(100);

    // Passo 15: Desempenho
    const performanceScore = medirDesempenho(respTime);
    stepsCompleted++;
    logProgress(`Site: ${url} [Desempenho medido]`);
    await sleep(100);

    // Passo 16: Screenshot
    const printFolder = path.join(domainPath, "print");
    if (!fs.existsSync(printFolder)) fs.mkdirSync(printFolder);
    const screenshotFile = path.join(printFolder, "homepage.png");
    const screenshotSuccess = await takeScreenshot(url, screenshotFile);
    if (screenshotSuccess) {
      if (process.platform === "win32") {
        exec(`start "" "${screenshotFile}"`);
      } else if (process.platform === "darwin") {
        exec(`open "${screenshotFile}"`);
      } else {
        exec(`xdg-open "${screenshotFile}"`);
      }
    }
    stepsCompleted++;
    logProgress(`Site: ${url} [Screenshot capturado]`);
    await sleep(100);

    // Compor os detalhes completos e armazenar
    const details = composeDetails(url, {
      online, respTime, redirChain, sslValid, sslExpiry, dnsIps, pingSuccess,
      contentType, pageTitle, erros, robots, sitemap, metaRefresh, wpFeatures,
      totalVersoes, performanceScore, screenshotFile: screenshotSuccess ? screenshotFile : null
    });
    resultsBySite[url] = details;
    updateSiteList(url);
    // Se for o primeiro site, atualiza os detalhes automaticamente
    if (Object.keys(resultsBySite).length === 1) {
      updateDetails(details);
      siteList.select(0);
    }
    logProgress(`Site ${url} concluído.`);
    await sleep(500);
  }

  logProgress("Processamento finalizado. Use as setas para navegar nos sites. Pressione ESC, q ou Ctrl+C para sair.");
  screen.render();

  // Ao selecionar um site, exibe seus detalhes
  siteList.on('select', function(item) {
    const selectedUrl = item.getText();
    const details = resultsBySite[selectedUrl] || "Detalhes não disponíveis.";
    updateDetails(details);
  });

  // Foca na lista para navegação; use as setas direita/esquerda para alternar o foco
  siteList.focus();
  screen.key(['escape', 'q', 'C-c'], function() {
    process.exit(0);
  });
}

main();
