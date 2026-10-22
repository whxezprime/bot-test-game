const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// --- CẤU HÌNH CƠ BẢN ---
const TOKEN = "ĐIỀN_TOKEN_CỦA_BẠN_VÀO_ĐÂY"; // <--- THAY TOKEN VÀO ĐÂY
const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;
const GRID_SIZE = 25; // Kích thước nhân vật

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Database
const db = new Database('game.db');
db.prepare(`CREATE TABLE IF NOT EXISTS players (
    user_id TEXT PRIMARY KEY, name TEXT, x INTEGER, y INTEGER
)`).run();

// --- BIẾN LƯU ẢNH PIXEL ---
let mapImage = null;
let playerImage = null;

// --- HÀM VẼ BẢN ĐỒ ---
function generateMapBuffer() {
    const canvas = createCanvas(MAP_WIDTH, MAP_HEIGHT);
    const ctx = canvas.getContext('2d');

    // Tắt làm mờ (Anti-aliasing) để pixel sắc nét
    ctx.imageSmoothingEnabled = false; 

    // 1. Vẽ nền bản đồ
    if (mapImage) {
        ctx.drawImage(mapImage, 0, 0, MAP_WIDTH, MAP_HEIGHT);
    } else {
        // Fallback nếu không tìm thấy ảnh map.png
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    }

    // 2. Lấy tất cả người chơi từ DB
    const players = db.prepare("SELECT * FROM players").all();
    
    ctx.font = 'bold 14px sans-serif';
    players.forEach(p => {
        // Vẽ nhân vật
        if (playerImage) {
            ctx.drawImage(playerImage, p.x, p.y, GRID_SIZE, GRID_SIZE);
        } else {
            // Fallback nếu không tìm thấy ảnh player.png
            ctx.fillStyle = '#e74c3c';
            ctx.fillRect(p.x, p.y, GRID_SIZE, GRID_SIZE);
            ctx.strokeStyle = 'white';
            ctx.strokeRect(p.x, p.y, GRID_SIZE, GRID_SIZE);
        }

        // Vẽ tên (Kèm viền đen để dễ đọc trên mọi nền)
        ctx.fillStyle = 'black';
        ctx.fillText(p.name, p.x + 1, p.y - 4);
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

// --- SỰ KIỆN KHỞI ĐỘNG ---
client.once('ready', async () => {
    console.log(`Bot ${client.user.tag} đã online!`);

    // Load ảnh Pixel từ thư mục assets
    try {
        mapImage = await loadImage(path.join(__dirname, 'assets', 'map.png'));
        playerImage = await loadImage(path.join(__dirname, 'assets', 'player.png'));
        console.log('✅ Đã load ảnh Pixel thành công!');
    } catch (error) {
        console.log('⚠️ Không tìm thấy ảnh trong thư mục assets. Sẽ dùng hình khối mặc định.');
    }
    
    // Đăng ký lệnh Slash
    const startCommand = { name: 'batdau', description: 'Bắt đầu vào thành phố' };
    if (client.guilds.cache.size > 0) {
        const guild = client.guilds.cache.first();
        await guild.commands.create(startCommand);
        console.log(`Đã đăng ký lệnh /batdau tại server: ${guild.name}`);
    }
});

// --- XỬ LÝ TƯƠNG TÁC ---
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'batdau') {
        const buffer = generateMapBuffer();
        const embed = new EmbedBuilder()
            .setTitle("🏙️ Thành phố Discord (Pixel Edition)")
            .setDescription("Dùng các nút mũi tên để di chuyển.\nMọi người trong server đều nhìn thấy bạn!")
            .setColor('#2ecc71')
            .setImage('attachment://map.png');

        await interaction.reply({ 
            embeds: [embed], 
            files: [{ attachment: buffer, name: 'map.png' }], 
            components: getButtons() 
        });
    }

    if (interaction.isButton()) {
        const userId = interaction.user.id;
        const userName = interaction.user.displayName;

        let player = db.prepare("SELECT * FROM players WHERE user_id = ?").get(userId);

        // Nếu chưa có, tạo mới ở giữa
        if (!player) {
            player = { user_id: userId, name: userName, x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
            db.prepare("INSERT INTO players (user_id, name, x, y) VALUES (?, ?, ?, ?)")
              .run(player.user_id, player.name, player.x, player.y);
        }

        let dx = 0, dy = 0;
        if (interaction.customId === 'up') dy -= GRID_SIZE;
        if (interaction.customId === 'down') dy += GRID_SIZE;
        if (interaction.customId === 'left') dx -= GRID_SIZE;
        if (interaction.customId === 'right') dx += GRID_SIZE;

        if (dx !== 0 || dy !== 0) {
            let newX = Math.max(0, Math.min(MAP_WIDTH - GRID_SIZE, player.x + dx));
            let newY = Math.max(0, Math.min(MAP_HEIGHT - GRID_SIZE, player.y + dy));

            db.prepare("UPDATE players SET x = ?, y = ? WHERE user_id = ?").run(newX, newY, userId);

            const newBuffer = generateMapBuffer();
            const embed = new EmbedBuilder()
                .setTitle("🏙️ Thành phố Discord (Pixel Edition)")
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

client.login(TOKEN);
