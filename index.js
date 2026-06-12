const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { REST } = require('@discordjs/rest');
const fs = require('fs');
const http = require('http'); 

// --- SERVER PARA RAILWAY/RENDER ---
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Eminence Gen Is Online!');
}).listen(port, '0.0.0.0');

// Intents necesarios incluyendo MessageContent para que funcione el prefijo "$"
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent 
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const PREFIX = '$';
const cooldowns = new Map();
const COOLDOWN_TIME = 600000; // 10 minutos

const services = [
    { name: 'Crunchyroll', value: 'crunchyroll' },
    { name: 'Fortnite', value: 'fortnite' },
    { name: 'Netflix', value: 'netflix' },
    { name: 'Minecraft', value: 'minecraft' },
    { name: 'Roblox', value: 'roblox' }
];

const commands = [
    new SlashCommandBuilder()
        .setName('fgen')
        .setDescription('Generate a free account')
        .addStringOption(opt => opt.setName('service').setDescription('Select service').setRequired(true).addChoices(...services)),
    
    new SlashCommandBuilder()
        .setName('bgen')
        .setDescription('Generate an exclusive account for server boosters and staff'),
    
    new SlashCommandBuilder().setName('stock').setDescription('Check stock status'),
    
    new SlashCommandBuilder()
        .setName('restock')
        .setDescription('Add accounts to a service')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(opt => opt.setName('service').setDescription('Service').setRequired(true).addChoices(...services))
        .addStringOption(opt => opt.setName('type').setDescription('Is booster?').setRequired(true).addChoices(
            { name: 'Free', value: 'free' },
            { name: 'Booster', value: 'booster' }
        ))
        .addStringOption(opt => opt.setName('account').setDescription('user:pass (Optional if file is sent)').setRequired(false))
        .addAttachmentOption(opt => opt.setName('file').setDescription('Upload a .txt file (Optional if account is typed)').setRequired(false)),

    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear all stock from a specific service')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(opt => opt.setName('service').setDescription('Service to clear').setRequired(true).addChoices(...services))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setPresence({ status: 'dnd' });
    
    try {
        await client.user.setUsername('Eminence Gen');
    } catch (e) { console.error('Username update error:', e.message); }
    
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log('🚀 Commands synchronized with Discord.');
    } catch (e) { console.error(e); }
});

// --- LÓGICA COMPARTIDA (Funciones globales) ---

const getPath = (serviceName, stockType) => {
    if (stockType === 'booster') return './boosters.txt';
    if (serviceName === 'crunchyroll') return './stock.txt';
    return `./${serviceName.toLowerCase()}.txt`;
};

const countStock = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split(/\s+/).filter(x => x).length : 0;

async function handleFGen(targetService, user, member, responder) {
    const isStaff = member.permissions.has(PermissionFlagsBits.ManageMessages);
    const isBooster = !!member.premiumSince;
    const bypassCooldown = isStaff || isBooster;

    if (!targetService) {
        return responder.reply({ content: `❌ Please specify a service! Choices: ${services.map(s => s.value).join(', ')}`, ephemeral: true });
    }

    const service = targetService.toLowerCase();
    const validService = services.find(s => s.value === service);
    if (!validService) {
        return responder.reply({ content: `❌ Invalid service! Choose from: ${services.map(s => s.value).join(', ')}`, ephemeral: true });
    }

    if (!bypassCooldown && cooldowns.has(user.id)) {
        const exp = cooldowns.get(user.id) + COOLDOWN_TIME;
        if (Date.now() < exp) {
            return responder.reply({ 
                content: `❌ Wait ${Math.ceil((exp - Date.now()) / 60000)} min before generating again.`, 
                ephemeral: true 
            });
        }
    }

    const path = getPath(service, 'free');
    if (!fs.existsSync(path)) return responder.reply({ content: `❌ File for ${service} not found.`, ephemeral: true });

    let accounts = fs.readFileSync(path, 'utf8').trim().split(/\s+/).filter(x => x);
    
    if (accounts.length > 0) {
        const acc = accounts.shift();
        fs.writeFileSync(path, accounts.join(' '));
        
        const dmEmbed = new EmbedBuilder()
            .setTitle('Account Generated')
            .setDescription('Your details have been sent to your DMs.')
            .setColor(0x5865F2)
            .addFields(
                { name: 'Service', value: `\`${service.toUpperCase()}\``, inline: true },
                { name: 'Account', value: `\`${acc}\``, inline: true }
            )
            .setFooter({ text: 'Eminence Gen' });
        
        try {
            await user.send({ embeds: [dmEmbed] });
            if (!bypassCooldown) cooldowns.set(user.id, Date.now());

            const serverEmbed = new EmbedBuilder()
                .setTitle('Account Sent')
                .setColor(0x5865F2)
                .addFields(
                    { name: 'User', value: `<@${user.id}>`, inline: true },
                    { name: 'Account type', value: `\`${service.toUpperCase()}\``, inline: true },
                    { name: 'Type', value: '`Free`', inline: true }
                )
                .setFooter({ text: 'Eminence Gen' });

            await responder.reply({ embeds: [serverEmbed] });
        } catch {
            await responder.reply({ content: '❌ I can\'t send you DMs! Please open them in Settings.', ephemeral: true });
        }
    } else {
        await responder.reply({ content: `❌ Sorry, we are out of stock for **${service}**!` });
    }
}

async function handleBGen(user, member, responder) {
    const isStaff = member.permissions.has(PermissionFlagsBits.ManageMessages);
    const isBooster = !!member.premiumSince;
    const bypassCooldown = isStaff || isBooster;

    if (!isStaff && !isBooster) {
        return responder.reply({ content: '❌ This command is only for server boosters and staff!', ephemeral: true });
    }

    if (!bypassCooldown && cooldowns.has(user.id)) {
        const exp = cooldowns.get(user.id) + COOLDOWN_TIME;
        if (Date.now() < exp) {
            return responder.reply({ 
                content: `❌ Wait ${Math.ceil((exp - Date.now()) / 60000)} min before generating again.`, 
                ephemeral: true 
            });
        }
    }

    const path = './boosters.txt';
    if (!fs.existsSync(path)) return responder.reply({ content: '❌ Booster stock file not found.', ephemeral: true });

    let accounts = fs.readFileSync(path, 'utf8').trim().split(/\s+/).filter(x => x);
    
    if (accounts.length > 0) {
        const acc = accounts.shift();
        fs.writeFileSync(path, accounts.join(' '));
        
        const dmEmbed = new EmbedBuilder()
            .setTitle('Premium Reward Generated')
            .setDescription('Exclusive booster account detail.')
            .setColor(0xF47FFF)
            .addFields(
                { name: 'Tier', value: '`BOOSTER / STAFF`', inline: true },
                { name: 'Account', value: `\`${acc}\``, inline: true }
            )
            .setFooter({ text: 'Eminence Gen' });
        
        try {
            await user.send({ embeds: [dmEmbed] });
            if (!bypassCooldown) cooldowns.set(user.id, Date.now());

            const serverEmbed = new EmbedBuilder()
                .setTitle('Account Sent')
                .setColor(0xF47FFF)
                .addFields(
                    { name: 'User', value: `<@${user.id}>`, inline: true },
                    { name: 'Account type', value: '`BOOSTER STOCK`', inline: true },
                    { name: 'Type', value: '`Booster`', inline: true }
                )
                .setFooter({ text: 'Eminence Gen' });

            await responder.reply({ embeds: [serverEmbed] });
        } catch {
            await responder.reply({ content: '❌ I can\'t send you DMs! Please open them in Settings.', ephemeral: true });
        }
    } else {
        await responder.reply({ content: '❌ Sorry, we are out of stock for Boosters!' });
    }
}

async function handleStock(responder) {
    const embed = new EmbedBuilder()
        .setTitle('📊 Current Stock')
        .setColor(0x5865F2)
        .addFields(
            { name: 'Crunchyroll', value: `${countStock('./stock.txt')}`, inline: true },
            { name: 'Fortnite', value: `${countStock('./fortnite.txt')}`, inline: true },
            { name: 'Netflix', value: `${countStock('./netflix.txt')}`, inline: true },
            { name: 'Minecraft', value: `${countStock('./minecraft.txt')}`, inline: true },
            { name: 'Roblox', value: `${countStock('./roblox.txt')}`, inline: true }
        )
        .setFooter({ text: 'Eminence Gen' });
    await responder.reply({ embeds: [embed] });
}

// --- EVENTO 1: ESCUCHAR COMANDOS CON PREFIJO ($) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const responder = {
        reply: (options) => message.reply(options)
    };

    if (commandName === 'fgen') {
        await handleFGen(args[0], message.author, message.member, responder);
    }
    if (commandName === 'bgen') {
        await handleBGen(message.author, message.member, responder);
    }
    if (commandName === 'stock') {
        await handleStock(responder);
    }
});

// --- EVENTO 2: ESCUCHAR SLASH COMMANDS (/) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user, member } = interaction;
    
    const isStaff = member.permissions.has(PermissionFlagsBits.ManageMessages);

    const responder = {
        reply: (opts) => interaction.reply(opts)
    };

    if (commandName === 'fgen') {
        const service = options.getString('service');
        await handleFGen(service, user, member, responder);
    }
    if (commandName === 'bgen') {
        await handleBGen(user, member, responder);
    }
    if (commandName === 'stock') {
        await handleStock(responder);
    }

    if (commandName === 'clear') {
        if (!isStaff) {
            return interaction.reply({ content: "❌ You don't have permission to use this command!", ephemeral: true });
        }
        const service = options.getString('service');
        const path = getPath(service, 'free');
        if (!fs.existsSync(path)) return interaction.reply({ content: `❌ File for ${service} not found.`, ephemeral: true });
        
        fs.writeFileSync(path, ''); 
        return interaction.reply({ content: `✅ Stock for **${service}** has been cleared!`, ephemeral: true });
    }

    if (commandName === 'restock') {
        if (!isStaff) {
            return interaction.reply({ content: "❌ You don't have permission to use this command!", ephemeral: true });
        }

        const service = options.getString('service');
        const stockType = options.getString('type');
        const account = options.getString('account');
        const file = options.getAttachment('file');
        
        if (!account && !file) {
            return interaction.reply({ content: "❌ Provide either an account or a .txt file.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const path = getPath(service, stockType);
        let contentToAdd = '';

        try {
            if (file) {
                const response = await fetch(file.url);
                const text = await response.text();
                contentToAdd = fs.existsSync(path) ? `\n${text.trim()}` : text.trim();
            } else if (account) {
                contentToAdd = fs.existsSync(path) ? ` ${account.trim()}` : account.trim();
            }

            if (!fs.existsSync(path)) fs.writeFileSync(path, '');
            fs.appendFileSync(path, contentToAdd);

            const targetName = stockType === 'booster' ? 'Boosters' : service;
            return interaction.editReply({ content: `✅ Stock for **${targetName}** updated successfully.` });
        } catch (error) {
            console.error(error);
            return interaction.editReply({ content: "❌ Error processing the restock operation." });
        }
    }
});

client.login(TOKEN);

