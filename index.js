require('dotenv').config();
require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { REST } = require('@discordjs/rest');
const fs = require('fs');
const http = require('http'); 

// --- SERVER PARA RAILWAY/RENDER ---
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Reze Gen Is Online!');
}).listen(port, '0.0.0.0');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const cooldowns = new Map();
const COOLDOWN_TIME = 600000; // 10 minutos

const services = [
    { name: 'Crunchyroll', value: 'crunchyroll' },
    { name: 'Fortnite', value: 'fortnite' },
    { name: 'Netflix', value: 'netflix' },
    { name: 'Minecraft', value: 'minecraft' },
    { name: 'Roblox', value: 'roblox' },
    { name: 'CC', value: 'cc' }
];

// Lógica de rutas: Free = nombre.txt | Booster = bnombre.txt (con tus excepciones)
const getPath = (s, type) => {
    if (type === 'booster') {
        if (s === 'crunchyroll') return './bstock.txt';
        if (s === 'cc') return './bvcc.txt';
        return `./b${s}.txt`;
    }
    return `./${s}.txt`;
};

const commands = [
    new SlashCommandBuilder().setName('gen').setDescription('Generate an account').addStringOption(o => o.setName('service').setDescription('Select service').setRequired(true).addChoices(...services)),
    new SlashCommandBuilder().setName('bgen').setDescription('Generate Booster account').addStringOption(o => o.setName('service').setDescription('Select service').setRequired(true).addChoices(...services)),
    new SlashCommandBuilder().setName('stock').setDescription('Check stock status'),
    new SlashCommandBuilder().setName('restock').setDescription('Add accounts').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(o => o.setName('service').setDescription('Service').setRequired(true).addChoices(...services))
        .addStringOption(o => o.setName('type').setDescription('Free or Booster').setRequired(true).addChoices({name:'Free',value:'free'},{name:'Booster',value:'booster'}))
        .addStringOption(o => o.setName('account').setRequired(false)).addAttachmentOption(o => o.setName('file').setRequired(false)),
    new SlashCommandBuilder().setName('clear').setDescription('Clear stock').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(o => o.setName('service').setDescription('Service').setRequired(true).addChoices(...services))
        .addStringOption(o => o.setName('type').setDescription('Free or Booster').setRequired(true).addChoices({name:'Free',value:'free'},{name:'Booster',value:'booster'}))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    client.user.setPresence({ status: 'dnd' });
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`✅ Logged in as ${client.user.tag} (DND active)`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user, member } = interaction;
    const isStaff = member.permissions.has(PermissionFlagsBits.ManageMessages);
    const isBooster = !!member.premiumSince;

    if (commandName === 'clear') {
        if (!isStaff) return interaction.reply({ content: "❌ No permission!", ephemeral: true });
        const path = getPath(options.getString('service'), options.getString('type'));
        fs.writeFileSync(path, '');
        return interaction.reply({ content: `✅ Cleared!`, ephemeral: true });
    }

    if (commandName === 'gen' || commandName === 'bgen') {
        if (commandName === 'bgen' && !isStaff && !isBooster) return interaction.reply({ content: '❌ Booster only!', ephemeral: true });
        const service = options.getString('service');
        const path = getPath(service, commandName === 'bgen' ? 'booster' : 'free');
        
        if (!fs.existsSync(path)) return interaction.reply({ content: '❌ File not found.', ephemeral: true });
        let accs = fs.readFileSync(path, 'utf8').trim().split(/\s+/).filter(x => x);
        if (!accs.length) return interaction.reply({ content: '❌ Out of stock!', ephemeral: true });
        
        const acc = accs.shift();
        fs.writeFileSync(path, accs.join('\n'));
        
        let embed;
        if (service === 'cc') {
            embed = new EmbedBuilder().setTitle('💎 Virtual Credit Card').setColor(0x0099FF).setDescription(`**Your virtual cc:** \`${acc}\``);
        } else {
            embed = new EmbedBuilder().setTitle(commandName === 'bgen' ? '💎 Premium Booster Account' : 'Reze Gen! :3').setColor(commandName === 'bgen' ? 0xF47FFF : 0xFF6347)
                .addFields({ name: 'Service', value: service, inline: true }, { name: 'Account', value: `\`${acc}\``, inline: true }).setFooter({ text: 'Enjoy!' });
        }
        
        try { await user.send({ embeds: [embed] }); interaction.reply({ content: '✅ Check DMs!', ephemeral: true }); }
        catch { interaction.reply({ content: '❌ Open DMs!', ephemeral: true }); }
    }

    if (commandName === 'stock') {
        await interaction.deferReply({ ephemeral: true });
        const count = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split(/\s+/).filter(x => x).length : 0;
        const embed = new EmbedBuilder().setTitle('📊 Stock').setColor(0x5865F2);
        services.forEach(s => embed.addFields({ name: s.name, value: `Free: \`${count(getPath(s.value, 'free'))}\` | Booster: \`${count(getPath(s.value, 'booster'))}\``, inline: false }));
        await interaction.editReply({ embeds: [embed] });
    }

    if (commandName === 'restock') {
        if (!isStaff) return interaction.reply({ content: "❌ No permission!", ephemeral: true });
        const path = getPath(options.getString('service'), options.getString('type'));
        let data = options.getAttachment('file') ? await (await fetch(options.getAttachment('file').url)).text() : options.getString('account');
        const current = fs.existsSync(path) ? fs.readFileSync(path, 'utf8').trim() : '';
        fs.writeFileSync(path, current ? `${current}\n${data.trim()}` : data.trim());
        interaction.reply({ content: '✅ Stock updated!', ephemeral: true });
    }
});

client.login(TOKEN);
            
