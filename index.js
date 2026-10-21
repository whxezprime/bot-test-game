const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const Database = require('better-sqlite3');

// --- CẤU HÌNH CƠ BẢN ---
const TOKEN = "ĐIỀN_TOKEN_CỦA_BẠN_VÀO_ĐÂY"; // <--- THAY TOKEN VÀO ĐÂY
const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;
const GRID_SIZE = 25; // Kích thước mỗi bước di chuyển

// Khởi tạo Bot
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Khởi tạo Database (Lưu vị trí người chơi)
const db = new Database('game.db');
db.prepare(`CREATE TABLE IF NOT EXISTS players (
    user_id TEXT PRIMARY KEY, 
    name TEXT, 
    x INTEGER, 
    y INTEGER
)`).run();

// --- HÀM VẼ BẢN ĐỒ ---
function generateMapBuffer() {
    const canvas = createCanvas(MAP_WIDTH, MAP_HEIGHT);
    const ctx = canvas.getContext('2d');

    // 1. Vẽ nền
    ctx.fillStyle = '#2c3e50'; 
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // 2. Vẽ đường xá và tòa nhà
    ctx.fillStyle = '#7f8c8d'; // Đường
    ctx.fillRect(100, 100, 600, 50);
    ctx.fillRect(300, 50, 50, 500);

    ctx.fillStyle = '#34495e'; // Tòa nhà
    ctx.fillRect(150, 200, 100, 100);
    ctx.strokeStyle = '#ecf0f1'; // Viền tòa nhà
    ctx.strokeRect(150, 200, 100, 100);

    // 3. Lấy tất cả người chơi từ DB và vẽ lên
    const players = db.prepare("SELECT * FROM players").all();
    
    ctx.font = '14px sans-serif';
    players.forEach(p => {
        // Vẽ nhân vật (hình vuông đỏ)
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(p.x, p.y, GRID_SIZE, GRID_SIZE);
        ctx.strokeStyle = 'white';
        ctx.strokeRect(p.x, p.y, GRID_SIZE, GRID_SIZE);

        // Vẽ tên
        ctx.fillStyle = 'white';
        ctx.fillText(p.name, p.x, p.y - 5);
    });

    return canvas.toBuffer('image/png');
}

// --- GIAO DIỆN NÚT BẤM ---
function getButtons() {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('up').setEmoji('⬆️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('down').setEmoji('⬇️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('left').setEmoji('⬅️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('right').setEmoji('➡️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('interact').setLabel('Tương tác').setStyle(ButtonStyle.Success)
    );
    return [row];
}

// --- XỬ LÝ SỰ KIỆN ---
client.once('ready', async () => {
    console.log(`Bot ${client.user.tag} đã online!`);
    
    // Đăng ký lệnh Slash
    const startCommand = {
        name: 'batdau',
        description: 'Bắt đầu vào thành phố',
    };

    // Đăng ký lệnh (Guild command để test nhanh, nếu muốn toàn cầu dùng client.application.commands.create)
    if (client.guilds.cache.size > 0) {
        const guild = client.guilds.cache.first();
        await guild.commands.create(startCommand);
        console.log(`Đã đăng ký lệnh /batdau tại server: ${guild.name}`);
    }
});

client.on('interactionCreate', async interaction => {
    // 1. Xử lý lệnh /batdau
    if (interaction.isChatInputCommand() && interaction.commandName === 'batdau') {
        const buffer = generateMapBuffer();
        const embed = new EmbedBuilder()
            .setTitle("🏙️ Thành phố Discord")
            .setDescription("Dùng các nút mũi tên để di chuyển.\nMọi người trong server đều nhìn thấy bạn!")
            .setColor('#2ecc71')
            .setImage('attachment://map.png');

        await interaction.reply({ 
            embeds: [embed], 
            files: [{ attachment: buffer, name: 'map.png' }], 
            components: getButtons() 
        });
    }

    // 2. Xử lý khi bấm nút
    if (interaction.isButton()) {
        const userId = interaction.user.id;
        const userName = interaction.user.displayName;

        // Lấy thông tin người chơi từ DB
        let player = db.prepare("SELECT * FROM players WHERE user_id = ?").get(userId);

        // Nếu chưa có trong DB, tạo mới ở giữa bản đồ
        if (!player) {
            player = { user_id: userId, name: userName, x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
            db.prepare("INSERT INTO players (user_id, name, x, y) VALUES (?, ?, ?, ?)")
              .run(player.user_id, player.name, player.x, player.y);
        }

        // Xử lý di chuyển
        let dx = 0, dy = 0;
        if (interaction.customId === 'up') dy -= GRID_SIZE;
        if (interaction.customId === 'down') dy += GRID_SIZE;
        if (interaction.customId === 'left') dx -= GRID_SIZE;
        if (interaction.customId === 'right') dx += GRID_SIZE;

        if (dx !== 0 || dy !== 0) {
            // Cập nhật vị trí mới, giới hạn trong bản đồ
            let newX = Math.max(0, Math.min(MAP_WIDTH - GRID_SIZE, player.x + dx));
            let newY = Math.max(0, Math.min(MAP_HEIGHT - GRID_SIZE, player.y + dy));

            db.prepare("UPDATE players SET x = ?, y = ? WHERE user_id = ?").run(newX, newY, userId);

            // Vẽ lại bản đồ và cập nhật tin nhắn
            const newBuffer = generateMapBuffer();
            const embed = new EmbedBuilder()
                .setTitle("🏙️ Thành phố Discord")
                .setColor('#2ecc71')
                .setImage('attachment://map.png');

            await interaction.update({ 
                embeds: [embed], 
                files: [{ attachment: newBuffer, name: 'map.png' }] 
            });
        } else if (interaction.customId === 'interact') {
            await interaction.reply({ content: "🚗 Bạn đang đứng trước một tòa nhà. Chưa có tính năng gì cả!", ephemeral: true });
        }
    }
});

// Đăng nhập Bot
client.login(TOKEN);
