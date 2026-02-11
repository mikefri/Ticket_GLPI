// api/ask.js  — Vercel Serverless Function
// La clé Anthropic est lue depuis les variables d'environnement Vercel
// Elle n'est JAMAIS exposée au navigateur

export default async function handler(req, res) {
    // CORS headers (ajustez l'origine si besoin)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { question, knowledgeBase } = req.body;

    if (!question || !knowledgeBase) {
        return res.status(400).json({ error: 'Champs manquants : question et knowledgeBase requis' });
    }

    // Clé lue côté serveur uniquement — jamais envoyée au client
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Clé API Anthropic non configurée sur le serveur' });
    }

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1024,
                messages: [{
                    role: 'user',
                    content: `Tu es un assistant expert en GLPI. Voici la base de connaissances complète :

<knowledge_base>
${knowledgeBase}
</knowledge_base>

Question : ${question}

Réponds uniquement sur la base des informations ci-dessus. Si l'info n'est pas disponible, dis-le clairement. Sois précis et concis.`
                }]
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || `Anthropic API ${response.status}`);
        }

        const data = await response.json();
        return res.status(200).json({ answer: data.content[0].text });

    } catch (e) {
        console.error('[ask] Error:', e.message);
        return res.status(500).json({ error: e.message });
    }
}
