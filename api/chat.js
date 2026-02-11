export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { question } = req.body;

    try {
        // 1. Récupération de la base GLPI sur GitHub
        const githubRes = await fetch(`https://api.github.com/repos/${process.env.GH_REPO}/contents/${process.env.KB_PATH}`, {
            headers: {
                'Authorization': `token ${process.env.GH_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        const knowledgeBase = await githubRes.text();

        // 2. Appel à Groq (Gratuit)
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile", // Modèle gratuit et très puissant
                messages: [
                    {
                        role: "system",
                        content: `Tu es un expert Reflex. Réponds en français en utilisant UNIQUEMENT cette base de connaissances : \n${knowledgeBase}`
                    },
                    { role: "user", content: question }
                ]
            })
        });

        const data = await groqRes.json();
        return res.status(200).json({ answer: data.choices[0].message.content });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
