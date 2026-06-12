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

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const cooldowns = new Map();
const COOLDOWN_TIME = 600000; // 10 minutos

// Lista de servicios con Epic Games incluido
const services = [
    { name: 'Crunchyroll', value: 'crunchyroll' },
    { name: 'Fortnite', value: 'fortnite' },
    { name: 'Netflix', value: 'netflix' },
    { name: 'Minecraft', value: 'minecraft' },
    { name: 'Roblox', value: 'roblox' },
    { name: 'Epic Games', value: 'epic' }
];

const commands = [
    new SlashCommandBuilder()
        .setName('fgen')
        .setDescription('Generate a free account')
        .addStringOption(opt => opt.setName('service').setDescription('Select service').setRequired(true).addChoices(...services)),
    
    new SlashCommandBuilder()
        .setName('bgen')
        .setDescription('Generate an exclusive account for server boosters and staff')
        .addStringOption(opt => opt.setName('service').setDescription('Select service').setRequired(true).addChoices(...services)),
    
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
        .addAttachmentOption(opt => opt.setName('file').setDescription('Upload a .txt file with accounts').setRequired(false)),

    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear all stock from a specific service and type')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(opt => opt.setName('service').setDescription('Service to clear').setRequired(true).addChoices(...services))
        .addStringOption(opt => opt.setName('type').setDescription('Type to clear').setRequired(true).addChoices(
            { name: 'Free', value: 'free' },
            { name: 'Booster', value: 'booster' }
        ))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setPresence({ status: 'dnd' });
    
    try {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
        console.log('🚀 Commands updated with Roblox, Epic, Boosters and Clear advanced.');
    } catch (e) { console.error(e); }
});

// Lógica de archivos inteligente: Todo comparte el mismo archivo menos Epic Booster que usa bepic.txt
const getPath = (serviceName, stockType) => {
    if (stockType === 'booster' && serviceName === 'epic') {
        return './bepic.txt';
    }
    if (serviceName === 'crunchyroll') return './stock.txt';
    return `./${serviceName.toLowerCase()}.txt`;
};

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user, member } = interaction;

    const isStaff = member.permissions.has(PermissionFlagsBits.ManageMessages);
    const isBooster = !!member.premiumSince;
    const bypassCooldown = isStaff || isBooster;

    if (commandName === 'clear') {
        if (!isStaff) {
            return interaction.reply({ content: "❌ You Don't Have Permission!", ephemeral: true });
        }
        
        const service = options.getString('service');
        const stockType = options.getString('type');
        const path = getPath(service, stockType);
        
        if (!fs.existsSync(path)) return interaction.reply({ content: `❌ File for ${service} (${stockType}) not found.`, ephemeral: true });
        
        fs.writeFileSync(path, ''); 
        return interaction.reply({ content: `✅ Stock for **${service} (${stockType})** has been cleared!`, ephemeral: true });
    }

    if (commandName === 'fgen' || commandName === 'bgen') {
        if (commandName === 'bgen' && !bypassCooldown) {
            return interaction.reply({ content: '❌ This command is only for server boosters and staff!', ephemeral: true });
        }

        const service = options.getString('service');
        
        if (!bypassCooldown && cooldowns.has(user.id)) {
            const exp = cooldowns.get(user.id) + COOLDOWN_TIME;
            if (Date.now() < exp) {
                return interaction.reply({ 
                    content: `❌ Wait ${Math.ceil((exp - Date.now()) / 60000)} min before generating again.`, 
                    ephemeral: true 
                });
            }
        }

        const stockType = commandName === 'bgen' ? 'booster' : 'free';
        const path = getPath(service, stockType);
        
        if (!fs.existsSync(path)) return interaction.reply({ content: `❌ File for ${service} not found.`, ephemeral: true });

        const fileContent = fs.readFileSync(path, 'utf8').trim();
        if (!fileContent) {
            return interaction.reply({ content: `❌ Sorry, we are out of stock for **${service} (${stockType})**!`, ephemeral: true });
        }

        let accounts = fileContent.split(/\s+/).filter(x => x);
        
        if (accounts.length > 0) {
            const acc = accounts.shift();
            fs.writeFileSync(path, accounts.join(' '));
            
            // Embed privado que va a los Mensajes Directos del usuario
            const dmEmbed = new EmbedBuilder()
                .setTitle(commandName === 'bgen' ? '💎 Premium Booster Account' : 'Reze Gen! :3')
                .setColor(commandName === 'bgen' ? 0xF47FFF : 0xFF6347)
                .addFields(
                    { name: 'Service', value: `\`${service.toUpperCase()}\``, inline: true },
                    { name: 'Account', value: `\`${acc}\``, inline: true }
                )
                .setFooter({ text: 'Enjoy your account!' });
            
            try {
                await user.send({ embeds: [dmEmbed] });
                if (!bypassCooldown) cooldowns.set(user.id, Date.now());

                // Embed público en inglés que se envía al canal del servidor
                const serverEmbed = new EmbedBuilder()
                    .setTitle('🎉 Account Generated!')
                    .setColor(commandName === 'bgen' ? 0xF47FFF : 0x5865F2)
                    .addFields(
                        { name: 'User', value: `<@${user.id}>`, inline: true },
                        { name: 'Service', value: `\`${service.toUpperCase()}\``, inline: true },
                        { name: 'Type', value: `\`${commandName === 'bgen' ? 'Booster' : 'Free'}\``, inline: true }
                    )
                    .setFooter({ text: 'Check your DMs!' });

                await interaction.reply({ embeds: [serverEmbed] });
            } catch {
                await interaction.reply({ content: '❌ I can\'t send you DMs! Please open them in Settings.', ephemeral: true });
            }
        } else {
            return interaction.reply({ content: `❌ Sorry, we are out of stock for **${service}**!`, ephemeral: true });
        }
    }

    if (commandName === 'stock') {
        await interaction.deferReply({ ephemeral: true });

        const count = (f) => {
            if (!fs.existsSync(f)) return 0;
            const content = fs.readFileSync(f, 'utf8').trim();
            if (!content) return 0;
            return content.split(/\s+/).filter(x => x).length;
        };
        
        const embed = new EmbedBuilder()
            .setTitle('📊 Current Stock')
            .setColor(0x5865F2)
            .setDescription('**Free Stock / Booster Stock**')
            .addFields(
                { name: 'Crunchyroll', value: `Free: \`${count('./stock.txt')}\` | Booster: \`${count('./stock.txt')}\``, inline: false },
                { name: 'Fortnite', value: `Free: \`${count('./fortnite.txt')}\` | Booster: \`${count('./fortnite.txt')}\``, inline: false },
                { name: 'Netflix', value: `Free: \`${count('./netflix.txt')}\` | Booster: \`${count('./netflix.txt')}\``, inline: false },
                { name: 'Minecraft', value: `Free: \`${count('./minecraft.txt')}\` | Booster: \`${count('./minecraft.txt')}\``, inline: false },
                { name: 'Roblox', value: `Free: \`${count('./roblox.txt')}\` | Booster: \`${count('./roblox.txt')}\``, inline: false },
                { name: 'Epic Games', value: `Free: \`${count('./epic.txt')}\` | Booster: \`${count('./bepic.txt')}\``, inline: false }
            );
        await interaction.editReply({ embeds: [embed] });
    }

    if (commandName === 'restock') {
        if (!isStaff) {
            return interaction.reply({ content: "❌ You Don't Have Permission!", ephemeral: true });
        }

        const service = options.getString('service');
        const stockType = options.getString('type');
        const account = options.getString('account');
        const file = options.getAttachment('file');
        
        if (!account && !file) {
            return interaction.reply({ content: "❌ Upload a .txt file or type an account.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const path = getPath(service, stockType);
        let contentToAdd = '';

        try {
            if (file) {
                const response = await fetch(file.url);
                const text = await response.text();
                contentToAdd = text.trim();
            } else if (account) {
                contentToAdd = account.trim();
            }

            if (!fs.existsSync(path)) fs.writeFileSync(path, '');
            
            const currentContent = fs.readFileSync(path, 'utf8').trim();
            if (currentContent.length > 0) {
                fs.writeFileSync(path, `${currentContent} ${contentToAdd}`);
            } else {
                fs.writeFileSync(path, contentToAdd);
            }

            return interaction.editReply({ content: `✅ Stock of **${service} (${stockType})** updated successfully in \`${path}\`.` });
        } catch (error) {
            console.error(error);
            return interaction.editReply({ content: "❌ Error updating the stock." });
        }
    }
});

client.login(TOKEN);

