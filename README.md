<header>
  <h1>Verificador de Sites WordPress</h1>
  <img src="https://github.com/user-attachments/assets/b9d8d442-83cd-4d36-a37a-228a5bcdabe1" alt="Logo do Projeto" />

  <p>
    Este projeto é um script de automação em Node.js que realiza diversas verificações em sites WordPress e exibe os resultados de forma elegante e interativa no terminal utilizando as bibliotecas <strong>blessed</strong> e <strong>blessed-contrib</strong>. O script executa várias análises, como verificação de disponibilidade, tempo de resposta, redirecionamentos, certificado SSL, resolução DNS, teste de ping, extração de título, análise de erros, verificação de arquivos essenciais (<code>robots.txt</code>, <code>sitemap.xml</code>, <code>meta refresh</code>) e verificações específicas para WordPress. Além disso, o script captura um screenshot da página inicial usando <strong>Puppeteer</strong>.
  </p>
</header>

<section class="section">
  <h2>Funcionalidades</h2>
  <ul>
    <li><strong>Verificações Realizadas (16 Passos):</strong>
      <ol>
        <li>Verificar disponibilidade do site (usando 5 métodos).</li>
        <li>Medir o tempo de resposta.</li>
        <li>Verificar redirecionamentos.</li>
        <li>Verificar certificado SSL (para URLs HTTPS).</li>
        <li>Verificar a resolução DNS do domínio.</li>
        <li>Executar teste de ping.</li>
        <li>Obter o cabeçalho Content-Type.</li>
        <li>Extrair o título da página.</li>
        <li>Analisar o conteúdo em busca de erros.</li>
        <li>Verificar a existência de <code>robots.txt</code>.</li>
        <li>Verificar a existência de <code>sitemap.xml</code>.</li>
        <li>Verificar a presença de <code>meta refresh</code>.</li>
        <li>Executar verificações específicas para WordPress (ex.: presença de <code>wp-content</code>, <code>wp-includes</code>, meta tag generator, endpoints <code>/wp-json/</code> e <code>/wp-admin/</code>).</li>
        <li>Salvar o conteúdo HTML para controle de versões (criando nova versão apenas se houver alterações).</li>
        <li>Medir o desempenho geral da página inicial (atribuindo uma pontuação de 0 a 100%).</li>
        <li>Capturar um screenshot da página inicial e tentar abri-lo automaticamente.</li>
      </ol>
    </li>
    <li><strong>Interface Interativa:</strong>
      <ul>
        <li>Lista de sites à esquerda: navegue com as setas e selecione com Enter ou clique para ver os detalhes.</li>
        <li>Detalhes do site à direita: exibe todas as informações completas das verificações.</li>
        <li>Log de progresso na parte inferior: exibe o status das etapas em tempo real.</li>
      </ul>
    </li>
    <li><strong>Score Final:</strong> O script calcula uma nota de 0 a 100% com base nos resultados:
      <ul>
        <li>0 a 40%: Vermelho</li>
        <li>41 a 90%: Amarelo</li>
        <li>91 a 100%: Verde Claro</li>
      </ul>
    </li>
    <li><strong>Screenshot:</strong> Exibe o caminho completo do arquivo de screenshot (sem formatação de hyperlink) e tenta abrir a imagem automaticamente.</li>
  </ul>
</section>

<section class="section">
  <h2>Requisitos</h2>
  <ul>
    <li>Node.js (versão 10 ou superior)</li>
    <li>Conexão com a Internet (para as verificações e para baixar as dependências)</li>
  </ul>
</section>

<section class="section">
  <h2>Instalação e Uso</h2>
  <ol>
    <li><strong>Clone o Repositório:</strong>
      <pre><code>git clone https://github.com/spalmeida/verifica-sites-node.git
cd verifica-sites-node</code></pre>
    </li>
    <li><strong>Adicione as URLs a serem verificadas:</strong>
      <p>Crie um arquivo chamado <code>links.txt</code> na raiz do projeto. Cada linha deve conter uma URL (linhas vazias ou iniciadas com <code>#</code> serão ignoradas).</p>
      <pre><code>https://exemplo1.com
https://exemplo2.com</code></pre>
    </li>
    <li><strong>Instale as Dependências:</strong>
      <pre><code>npm init -y
npm install axios cheerio chalk puppeteer blessed blessed-contrib</code></pre>
    </li>
    <li><strong>Execute o Script:</strong>
      <pre><code>node wordpress-check.js</code></pre>
    </li>
    <li><strong>Arquivo start.bat (Windows):</strong>
      <p>Para facilitar a execução no Windows, crie um arquivo chamado <code>start.bat</code> com o seguinte conteúdo:</p>
      <pre><code>@echo off
call npm init -y
call npm install axios cheerio chalk puppeteer blessed blessed-contrib
call node wordpress-check.js
pause</code></pre>
      <p>Execute o <code>start.bat</code> para iniciar o script. A janela permanecerá aberta após a execução.</p>
    </li>
  </ol>
</section>

<section class="section">
  <h2>Estrutura do Projeto</h2>
  <pre><code>
verifica-sites-node/
├── dominios/               # Diretório onde serão salvos os resultados (HTML, prints, etc.)
├── links.txt               # Arquivo contendo as URLs a serem verificadas
├── wordpress-check.js      # Script principal de verificação (Node.js)
├── start.bat               # Arquivo batch para executar o script (Windows)
└── README.md               # Documentação do projeto (este arquivo)
  </code></pre>
</section>

<section class="section">
  <h2>Observações</h2>
  <ul>
    <li><strong>Screenshot:</strong> O caminho completo do arquivo de screenshot é exibido; se o seu terminal não suportar hyperlinks, copie o caminho e abra-o manualmente.</li>
    <li><strong>Interface:</strong> Utilize as setas para navegar na lista de sites e no painel de detalhes. Pressione Enter (ou clique) para visualizar os detalhes. Use as setas esquerda/direita para alternar o foco entre os painéis.</li>
    <li><strong>Encerramento:</strong> Para sair, pressione ESC, <code>q</code> ou Ctrl+C.</li>
  </ul>
</section>

<section class="section">
  <h2>Contribuição</h2>
  <p>
    Contribuições são bem-vindas! Se você encontrar algum bug ou tiver sugestões de melhorias, sinta-se à vontade para abrir uma issue ou enviar um pull request.
  </p>
</section>

<section class="section">
  <h2>Licença</h2>
  <p>
    Este projeto está licenciado sob a <a href="https://opensource.org/licenses/MIT" target="_blank">MIT License</a>.
  </p>
</section>

<footer>
  <p>Projeto hospedado em <a href="https://github.com/spalmeida/verifica-sites-node/" target="_blank">https://github.com/spalmeida/verifica-sites-node/</a></p>
</footer>
