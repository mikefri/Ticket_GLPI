// api/chat.js
export default async function handler(req, res) {
    // Sécurité : On n'accepte que les requêtes POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    const { question } = req.body;

    // Récupération des variables d'environnement (configurées sur Vercel)
    const githubToken = process.env.GH_TOKEN;
    const githubRepo = process.env.GH_REPO; // ex: mikefri/backup_GLPI
    const kbPath = process.env.KB_PATH || 'KNOWLEDGE_BASE.md';
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    try {
        // 1. Récupération de la Base de Connaissances sur GitHub
        const githubUrl = `https://api.github.com/repos/${githubRepo}/contents/${kbPath}`;
        
        const githubResponse = await fetch(githubUrl, {
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });

        if (!githubResponse.ok) {
            throw new Error(`Erreur GitHub: ${githubResponse.statusText}`);
        }

        const knowledgeBase = await githubResponse.text();

        // 2. Appel à l'API Anthropic (Claude)
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20240620',
                max_tokens: 1024,
                messages: [
                    {
                        role: 'user',
                        content: `Tu es un expert GLPI. Utilise cette base : \n<kb>\n${knowledgeBase}\n</kb>\n\nQuestion : ${question}`
                    }
                ]
            })
        });

        const data = await claudeResponse.json();
        
        if (!claudeResponse.ok) {
            throw new Error(data.error?.message || 'Erreur Claude API');
        }

        // 3. Renvoi de la réponse au client (ton HTML)
        return res.status(200).json({ answer: data.content[0].text });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
}
