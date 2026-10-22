const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const Database = require('better-sqlite3');
const path = require('path');

const TOKEN = "ĐIỀN_TOKEN_CỦA_BẠN_VÀO_ĐÂY"; 
const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;
const PLAYER_SIZE = 24; 
const MOVE_SPEED = 15; 

// Bảng màu Among Us chuẩn
const AMONG_US_COLORS = [
    '#C51111', // Red
    '#132ED1', // Blue
    '#117F2D', // Green
    '#ED54BA', // Pink
    '#EF7D0D', // Orange
    '#F5F557', // Yellow
    '#D6E0F0', // White
    '#3F474E', // Black
    '#71491E', // Brown
    '#38FEDC'  // Cyan
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const db = new Database('amongus.db');

// Khởi tạo DB (Thêm cột color)
db.prepare(`CREATE TABLE IF NOT EXISTS players (
    user_id TEXT PRIMARY KEY, game_id TEXT, name TEXT, color TEXT, role TEXT, is_alive INTEGER, x INTEGER, y INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS games (
    game_id TEXT PRIMARY KEY, state TEXT
)`).run();

let lobbyImage = null;
let mapImage = null;
let mapCollisionData = null; 

// --- HÀM VẼ NHÂN VẬT AMONG US ---
function drawAmongUs(ctx, x, y, color) {
    // 1. Vẽ Balo (Bên trái)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - 6, y + 6, 8, 12, 3);
    ctx.fill();

    // 2. Vẽ Thân (Hình chữ nhật bo góc)
    ctx.beginPath();
    ctx.roundRect(x, y, 18, 22, 8); // Thân
    ctx.fill();
    
    // 3. Vẽ Chân (2 ống nhỏ dưới đáy)
    ctx.fillRect(x + 3, y + 20, 5, 6);
    ctx.fillRect(x + 11, y + 20, 5, 6);

    // 4. Vẽ Kính (Visor)
    ctx.fillStyle = '#8CE0F9'; // Màu xanh kính
    ctx.beginPath();
    ctx.roundRect(x + 7, y + 4, 11, 7, 3);
    ctx.fill();
    
    // Viền kính
    ctx.strokeStyle = '#7A9A9E';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Điểm sáng trên kính
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(x + 10, y + 6, 1.5, 0, Math.PI * 2);
    ctx.fill();
}

// --- HÀM KIỂM TRA VA CHẠM ---
function canMove(x, y) {
    if (!mapCollisionData) return true;
    if (x < 0 || y < 0 || x + PLAYER_SIZE > MAP_WIDTH || y + PLAYER_SIZE > MAP_HEIGHT) return false;

    const checkX = Math.floor(x + PLAYER_SIZE / 2);
    const checkY = Math.floor(y + PLAYER_SIZE / 2);
    
    const index = (checkY * MAP_WIDTH + checkX) * 4;
    const r = mapCollisionData[index];
    const g = mapCollisionData[index + 1];
    const b = mapCollisionData[index + 2];
    const alpha = mapCollisionData[index + 3];

    if (alpha < 50) return false; 
    if (r < 40 && g < 40 && b < 40) return false; 

    return true;
}

// --- HÀM VẼ BẢN ĐỒ ---
async function renderGame(gameId) {
    const game = db.prepare("SELECT * FROM games WHERE game_id = ?").get(gameId);
    const canvas = createCanvas(MAP_WIDTH, MAP_HEIGHT);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Vẽ nền
    if (game.state === 'lobby' && lobbyImage) {
        ctx.drawImage(lobbyImage, 0, 0, MAP_WIDTH, MAP_HEIGHT);
    } else if (game.state === 'playing' && mapImage) {
        ctx.drawImage(mapImage, 0, 0, MAP_WIDTH, MAP_HEIGHT);
    } else {
        ctx.fillStyle = '#2c3e50'; ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    }

    // Vẽ người chơi
    const players = db.prepare("SELECT * FROM players WHERE game_id = ?").all(gameId);
    players.forEach((p) => {
        if (p.is_alive === 1) {
            // Gọi hàm vẽ Among Us với màu của người chơi
            drawAmongUs(ctx, p.x, p.y, p.color);
            
            // Vẽ tên
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.name, p.x + 9, p.y - 8);
            ctx.textAlign = 'left'; // Reset
        } else if (game.state === 'playing') {
            // Xác chết (Nửa người)
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.roundRect(p.x, p.y + 10, 18, 12, 8);
            ctx.fill();
            // Xương
            ctx.fillStyle = 'white';
            ctx.font = '16px sans-serif';
            ctx.fillText("🦴", p.x + 2, p.y + 10);
        }
    });

    return canvas.toBuffer('image/png');
}

// --- GIAO DIỆN ---
function getGameButtons(isLobby = false) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('up').setEmoji('⬆️').setStyle(ButtonStyle.Secondary).setDisabled(isLobby),
        new ButtonBuilder().setCustomId('down').setEmoji('⬇️').setStyle(ButtonStyle.Secondary).setDisabled(isLobby),
        new ButtonBuilder().setCustomId('left').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(isLobby),
        new ButtonBuilder().setCustomId('right').setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(isLobby)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('kill').setLabel('Kill').setStyle(ButtonStyle.Danger).setDisabled(isLobby),
        new ButtonBuilder().setCustomId('report').setLabel('Report').setStyle(ButtonStyle.Primary).setDisabled(isLobby),
        new ButtonBuilder().setCustomId('emergency').setLabel('Emergency').setStyle(ButtonStyle.Success).setDisabled(isLobby)
    );
    return [row1, row2];
}

// --- SỰ KIỆN CHÍNH ---
client.once('ready', async () => {
    console.log(`Bot ${client.user.tag} đã online!`);
    try {
        lobbyImage = await loadImage(path.join(__dirname, 'assets', 'lobby.png'));
        mapImage = await loadImage(path.join(__dirname, 'assets', 'map.png'));
        
        const colCanvas = createCanvas(MAP_WIDTH, MAP_HEIGHT);
        const colCtx = colCanvas.getContext('2d');
        colCtx.drawImage(mapImage, 0, 0, MAP_WIDTH, MAP_HEIGHT);
        mapCollisionData = colCtx.getImageData(0, 0, MAP_WIDTH, MAP_HEIGHT).data;
    } catch (e) { 
        console.log("⚠️ Lỗi load ảnh nền.", e.message); 
    }
    
    const guild = client.guilds.cache.first();
    if(guild) {
        await guild.commands.create({ name: 'taogame', description: 'Tạo phòng Among Us' });
        await guild.commands.create({ name: 'vaogame', description: 'Tham gia phòng' });
        await guild.commands.create({ name: 'batdau', description: 'Bắt đầu game' });
    }
});

client.on('interactionCreate', async interaction => {
    const gameId = interaction.channelId;

    // TẠO GAME
    if (interaction.isChatInputCommand() && interaction.commandName === 'taogame') {
        db.prepare("INSERT OR REPLACE INTO games (game_id, state) VALUES (?, ?)").run(gameId, 'lobby');
        db.prepare("DELETE FROM players WHERE game_id = ?").run(gameId);
        
        const buffer = await renderGame(gameId);
        const embed = new EmbedBuilder().setTitle("🚀 PHÒNG CHỜ AMONG US").setDescription("Gõ `/vaogame` để tham gia.").setImage('attachment://map.png');
        await interaction.reply({ embeds: [embed], files: [{ attachment: buffer, name: 'map.png' }], components: getGameButtons(true) });
    }

    // VÀO GAME (RANDOM MÀU)
    if (interaction.isChatInputCommand() && interaction.commandName === 'vaogame') {
        const game = db.prepare("SELECT * FROM games WHERE game_id = ?").get(gameId);
        if (!game || game.state !== 'lobby') return interaction.reply({ content: "Không có phòng chờ!", ephemeral: true });
        
        // Lấy danh sách màu đã bị dùng
        const usedColors = db.prepare("SELECT color FROM players WHERE game_id = ?").all(gameId).map(p => p.color);
        // Lọc ra các màu chưa ai dùng
        const availableColors = AMONG_US_COLORS.filter(c => !usedColors.includes(c));
        
        if (availableColors.length === 0) return interaction.reply({ content: "Hết màu để chọn rồi! (Tối đa 10 người)", ephemeral: true });

        // Random 1 màu từ danh sách còn trống
        const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];

        db.prepare("INSERT OR IGNORE INTO players (user_id, game_id, name, color, is_alive, x, y) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(interaction.user.id, gameId, interaction.user.displayName, randomColor, 1, 400, 300);
        
        const buffer = await renderGame(gameId);
        await interaction.reply({ content: `${interaction.user.displayName} đã tham gia!`, files: [{ attachment: buffer, name: 'map.png' }] });
    }

    // BẮT ĐẦU GAME
    if (interaction.isChatInputCommand() && interaction.commandName === 'batdau') {
        const players = db.prepare("SELECT * FROM players WHERE game_id = ?").all(gameId);
        if (players.length < 3) return interaction.reply({ content: "Cần ít nhất 3 người!", ephemeral: true });

        const impostor = players[Math.floor(Math.random() * players.length)];
        db.prepare("UPDATE games SET state = 'playing' WHERE game_id = ?").run(gameId);
        db.prepare("UPDATE players SET role = 'crewmate' WHERE game_id = ?").run(gameId);
        db.prepare("UPDATE players SET role = 'impostor', x = 400, y = 200 WHERE user_id = ? AND game_id = ?").run(impostor.user_id, gameId);
        db.prepare("UPDATE players SET x = 400, y = 200 WHERE user_id != ? AND game_id = ?").run(impostor.user_id, gameId);

        const buffer = await renderGame(gameId);
        const embed = new EmbedBuilder().setTitle("🔪 GAME BẮT ĐẦU!").setDescription("Ai là Impostor?").setImage('attachment://map.png');
        await interaction.reply({ embeds: [embed], files: [{ attachment: buffer, name: 'map.png' }], components: getGameButtons(false) });
        
        const impUser = await client.users.fetch(impostor.user_id);
        impUser.send("🔪 BẠN LÀ IMPOSTOR! Hãy giết sạch Crewmate.").catch(()=>{});
    }

    // DI CHUYỂN
    if (interaction.isButton()) {
        const game = db.prepare("SELECT * FROM games WHERE game_id = ?").get(gameId);
        if (!game || game.state !== 'playing') return interaction.reply({ content: "Game chưa bắt đầu!", ephemeral: true });

        const player = db.prepare("SELECT * FROM players WHERE user_id = ? AND game_id = ?").get(interaction.user.id, gameId);
        if (!player || player.is_alive === 0) return interaction.reply({ content: "Bạn đã chết!", ephemeral: true });

        let dx = 0, dy = 0;
        if (interaction.customId === 'up') dy -= MOVE_SPEED;
        if (interaction.customId === 'down') dy += MOVE_SPEED;
        if (interaction.customId === 'left') dx -= MOVE_SPEED;
        if (interaction.customId === 'right') dx += MOVE_SPEED;

        if (dx !== 0 || dy !== 0) {
            let nx = player.x + dx;
            let ny = player.y + dy;

            if (canMove(nx, ny)) {
                db.prepare("UPDATE players SET x = ?, y = ? WHERE user_id = ?").run(nx, ny, player.user_id);
                const buffer = await renderGame(gameId);
                return await interaction.update({ files: [{ attachment: buffer, name: 'map.png' }] });
            } else {
                return interaction.reply({ content: "🧱 Không thể đi xuyên tường!", ephemeral: true });
            }
        }
        // Các nút Kill/Report/Emergency (Logic tương tự như trước)
    }
});

client.login(TOKEN);
