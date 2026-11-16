-- ═══════════════════════════════════════════════════════════════════
-- SHRED THE CASH — AUTO v17
-- auto farm · auto sell · auto upgrade · auto vault · records what it learns
-- ═══════════════════════════════════════════════════════════════════

if not game:IsLoaded() then game.Loaded:Wait() end
if game.GameId ~= 10772951756 then return end
if _G.ShredAuto then
    _G.ShredAuto.alive = false
    for _, c in ipairs(_G.ShredAuto.conns or {}) do pcall(function() c:Disconnect() end) end
    pcall(function() _G.ShredAuto.sg:Destroy() end)
    task.wait(0.3)
end

-- ══ run again by itself after every teleport (lobby → next game) ══
local SHRED_QUEUED = [[
task.spawn(function()
    local function note(t)
        pcall(function()
            local line = os.date("%H:%M:%S") .. " " .. tostring(t) .. "\n"
            if appendfile and isfile and isfile("shred_boot_log.txt") then appendfile("shred_boot_log.txt", line)
            else writefile("shred_boot_log.txt", line) end
        end)
    end
    local ok, err = pcall(function()
        note("woke up after a teleport")
        if not game:IsLoaded() then game.Loaded:Wait() end
        note("place " .. tostring(game.PlaceId) .. " game " .. tostring(game.GameId))
        if game.GameId ~= 10772951756 then note("not Shred The Cash, stopping") return end
        local stamp = 0
        pcall(function() stamp = tonumber(readfile("shred_overnight.txt")) or 0 end)
        if os.time() - stamp > 2700 then note("overnight farm is off or ran out (45 min), not starting") return end
        local Players = game:GetService("Players")
        local lp = Players.LocalPlayer
        while not lp do task.wait() lp = Players.LocalPlayer end
        _G.ShredAutoBoot = true
        local okK, key = pcall(function() return (readfile("cakefarm_key.txt"):gsub("%s+", "")) end)
        if not okK or type(key) ~= "string" or #key < 4 then note("no key file") return end
        for i = 1, 8 do
            local ok2, body = pcall(function()
                return game:HttpGet("https://examples-hello-worldd.olly1483.deno.net/script?key=" .. key .. "&id=" .. tostring(lp.UserId) .. "&game=shred")
            end)
            note("download try " .. i .. ": " .. tostring(ok2) .. " " .. (type(body) == "string" and (#body .. " chars") or tostring(body)))
            if ok2 and type(body) == "string" and #body > 500 and body:sub(1, 4) ~= "ERR:" then
                local f, cerr = loadstring(body)
                if not f then note("could not read it: " .. tostring(cerr)) return end
                local okR, rerr = pcall(f)
                note("started: " .. tostring(okR) .. " " .. tostring(rerr or ""))
                return
            end
            task.wait(3)
        end
    end)
    if not ok then note("boot error: " .. tostring(err)) end
end)
]]
local SHRED_QUEUE_STATE = "not tried"
pcall(function()
    local q = queue_on_teleport or queueonteleport or (syn and syn.queue_on_teleport) or (fluxus and fluxus.queue_on_teleport)
    if not q then SHRED_QUEUE_STATE = "this executor has no queue_on_teleport" return end
    if _G.ShredQueuedHere then SHRED_QUEUE_STATE = "already queued" return end
    local ok, e = pcall(q, SHRED_QUEUED)
    _G.ShredQueuedHere = ok
    SHRED_QUEUE_STATE = ok and "queued" or ("failed: " .. tostring(e))
end)
local SHRED_AUTOBOOT = _G.ShredAutoBoot == true
_G.ShredAutoBoot = nil

-- ══ not in a match (the lobby): record everything about it, so auto-join can be built ══
do
    local t0 = os.clock()
    while not workspace:FindFirstChild("Vault") and os.clock() - t0 < 10 do task.wait(0.25) end
end
if not workspace:FindFirstChild("Vault") then
    local Players = game:GetService("Players")
    local RSL = game:GetService("ReplicatedStorage")
    local lpl = Players.LocalPlayer
    while not lpl do task.wait() lpl = Players.LocalPlayer end
    local pgl = lpl:WaitForChild("PlayerGui")
    local P = { alive = true, conns = {} }
    _G.ShredAuto = P
    local LG, T0L = {}, os.clock()
    local FILE = "shred_lobby_log.txt"
    local function L(fmt, ...)
        local ok, str = pcall(string.format, fmt, ...)
        LG[#LG + 1] = string.format("%.1f ", os.clock() - T0L) .. (ok and str or tostring(fmt))
        if #LG > 4000 then table.remove(LG, 1) end
    end
    local function sv(v, d)
        d = d or 0
        local t = typeof(v)
        if t == "string" then return '"' .. (#v > 120 and (v:sub(1, 120) .. "..") or v) .. '"' end
        if t == "number" then return (v % 1 == 0) and tostring(v) or string.format("%.2f", v) end
        if t == "boolean" or t == "nil" then return tostring(v) end
        if t == "Vector3" then return string.format("V3(%.1f,%.1f,%.1f)", v.X, v.Y, v.Z) end
        if t == "Instance" then local ok, n = pcall(function() return v:GetFullName() end) return "<" .. (ok and n or "?") .. ">" end
        if t == "table" then
            if d >= 5 then return "{..}" end
            local parts, n = {}, 0
            for k, x in pairs(v) do
                n += 1
                if n > 60 then parts[#parts + 1] = ".." break end
                parts[#parts + 1] = (type(k) == "number" and "" or (tostring(k) .. "=")) .. sv(x, d + 1)
            end
            return "{" .. table.concat(parts, ", ") .. "}"
        end
        return t
    end
    local function sargs(a) local p = {} for i = 1, (a.n or #a) do p[i] = sv(a[i]) end return table.concat(p, ", ") end
    local function full(i) local ok, n = pcall(function() return i:GetFullName() end) return ok and n or "?" end
    local function pos(i)
        local ok, p = pcall(function()
            if i:IsA("BasePart") then return i.Position end
            if i:IsA("Model") then return i:GetPivot().Position end
            local par = i:FindFirstAncestorWhichIsA("BasePart") or i:FindFirstAncestorWhichIsA("Model")
            return par and (par:IsA("BasePart") and par.Position or par:GetPivot().Position)
        end)
        return (ok and p) and string.format("(%.0f,%.0f,%.0f)", p.X, p.Y, p.Z) or "(?)"
    end
    local prev = ""
    pcall(function() if isfile and isfile(FILE) then prev = readfile(FILE) end end)
    if #prev > 150000 then prev = prev:sub(-150000) end
    local function flush()
        pcall(function()
            writefile(FILE, prev .. "\n\n════ SHRED LOBBY v17 · place " .. tostring(game.PlaceId) .. " · " .. os.date("%H:%M:%S") .. " ════\n" .. table.concat(LG, "\n"))
        end)
    end
    L("place %s game %s job %s · players here %d · auto-started %s · queue: %s", tostring(game.PlaceId), tostring(game.GameId), tostring(game.JobId):sub(1, 8), #Players:GetPlayers(), tostring(SHRED_AUTOBOOT), SHRED_QUEUE_STATE)
    do
        local a = {}
        for k, v in pairs(lpl:GetAttributes()) do a[#a + 1] = k .. "=" .. sv(v) end
        table.sort(a)
        L("MY ATTRIBUTES %s", table.concat(a, ", "))
    end
    table.insert(P.conns, lpl.AttributeChanged:Connect(function(n) L("ATTRIBUTE %s = %s", n, sv(lpl:GetAttribute(n))) end))
    -- every remote there is, and everything the game sends down them
    local cnt = {}
    local function watchRemote(r)
        if r:IsA("RemoteEvent") or r:IsA("UnreliableRemoteEvent") then
            table.insert(P.conns, r.OnClientEvent:Connect(function(...)
                local a = table.pack(...)
                local k = full(r) .. "#" .. (type(a[1]) == "string" and a[1] or typeof(a[1]))
                cnt[k] = (cnt[k] or 0) + 1
                if cnt[k] <= 12 then L("SERVER SAID %s(%s)", full(r), sargs(a)) end
            end))
        end
    end
    local nRem = 0
    for _, d in ipairs(RSL:GetDescendants()) do
        if d:IsA("RemoteEvent") or d:IsA("RemoteFunction") or d:IsA("UnreliableRemoteEvent") then
            nRem += 1
            if nRem <= 200 then L("REMOTE %s %s", d.ClassName, full(d)) end
            pcall(watchRemote, d)
        end
    end
    table.insert(P.conns, RSL.DescendantAdded:Connect(function(d)
        if d:IsA("RemoteEvent") or d:IsA("RemoteFunction") then L("REMOTE (new) %s %s", d.ClassName, full(d)) pcall(watchRemote, d) end
    end))
    -- everything YOU do that the game sends to its server, and what the server answers
    _G.ShredAutoSink = function(remote, method, args)
        local k = "Y" .. full(remote) .. "#" .. tostring(args[1])
        cnt[k] = (cnt[k] or 0) + 1
        if cnt[k] <= 40 then L("YOU DID %s %s(%s)", method, full(remote), sargs(args)) end
    end
    _G.ShredAutoReply = function(remote, args, res)
        local k = "A" .. full(remote) .. "#" .. tostring(args[1])
        cnt[k] = (cnt[k] or 0) + 1
        if cnt[k] <= 40 then L("  └ GAME ANSWERED %s(%s) -> %s", full(remote), sargs(args), sargs(res)) end
    end
    if not _G.ShredAutoHooked then
        _G.ShredAutoHooked = "failed"
        pcall(function()
            local ncc = newcclosure or function(f) return f end
            local old
            old = hookmetamethod(game, "__namecall", ncc(function(self, ...)
                local m = getnamecallmethod()
                if (m == "FireServer" or m == "InvokeServer") and not (checkcaller and checkcaller()) then
                    local args = table.pack(...)
                    local sink = _G.ShredAutoSink
                    if sink then task.defer(sink, self, m, args, false) end
                    if m == "InvokeServer" then
                        local res = table.pack(old(self, ...))
                        local rp = _G.ShredAutoReply
                        if rp then task.defer(rp, self, args, res) end
                        return table.unpack(res, 1, res.n)
                    end
                end
                return old(self, ...)
            end))
            _G.ShredAutoHooked = "on"
        end)
    end
    L("recorder: %s", tostring(_G.ShredAutoHooked))
    -- the world: what is in the lobby
    do
        local names = {}
        for _, c in ipairs(workspace:GetChildren()) do if #names < 90 then names[#names + 1] = c.Name .. "[" .. c.ClassName .. "]" end end
        L("WORKSPACE: %s", table.concat(names, " · "))
        local n = 0
        for _, d in ipairs(workspace:GetDescendants()) do
            if d:IsA("ProximityPrompt") then
                L("PROMPT \"%s\" / \"%s\" %s at %s hold %.1f enabled %s", d.ActionText, d.ObjectText, full(d.Parent), pos(d), d.HoldDuration, tostring(d.Enabled))
            elseif d:IsA("ClickDetector") then
                L("CLICK %s at %s", full(d.Parent), pos(d))
            elseif d:IsA("TouchTransmitter") and n < 80 then
                n += 1
                L("TOUCH PART %s at %s", full(d.Parent), pos(d))
            elseif (d:IsA("BillboardGui") or d:IsA("SurfaceGui")) then
                local txt = {}
                for _, t in ipairs(d:GetDescendants()) do if (t:IsA("TextLabel") or t:IsA("TextButton")) and #t.Text > 0 and #txt < 6 then txt[#txt + 1] = t.Text:sub(1, 40) end end
                if #txt > 0 then L("SIGN %s at %s: %s", full(d), pos(d), table.concat(txt, " | ")) end
            end
        end
    end
    table.insert(P.conns, workspace.DescendantAdded:Connect(function(d)
        pcall(function()
            if d:IsA("ProximityPrompt") then L("PROMPT (new) \"%s\" / \"%s\" %s at %s", d.ActionText, d.ObjectText, full(d.Parent), pos(d)) end
        end)
    end))
    pcall(function()
        local PPS = game:GetService("ProximityPromptService")
        table.insert(P.conns, PPS.PromptTriggered:Connect(function(pr) L("YOU USED PROMPT \"%s\" / \"%s\" %s at %s", pr.ActionText, pr.ObjectText, full(pr.Parent), pos(pr)) end))
    end)
    -- the screen: every button as it shows up, and every button you press
    local seenBtn = {}
    local function shownL(o)
        local p = o
        while p and p ~= game do
            if p:IsA("GuiObject") and not p.Visible then return false end
            if p:IsA("LayerCollector") and not p.Enabled then return false end
            p = p.Parent
        end
        return o.AbsoluteSize.X > 2
    end
    local function textL(b)
        local t = {}
        if b:IsA("TextButton") or b:IsA("TextBox") then t[#t + 1] = b.Text end
        for _, d in ipairs(b:GetDescendants()) do if (d:IsA("TextLabel") or d:IsA("TextButton")) and #t < 6 then t[#t + 1] = d.Text end end
        return table.concat(t, " | "):sub(1, 90)
    end
    local function hookBtn(b)
        if seenBtn[b] then return end
        seenBtn[b] = true
        pcall(function()
            table.insert(P.conns, b.Activated:Connect(function() L("YOU PRESSED %s «%s»", full(b), textL(b)) end))
        end)
    end
    task.spawn(function()
        local logged = {}
        while P.alive do
            pcall(function()
                local guis = {}
                for _, g in ipairs(pgl:GetChildren()) do if g:IsA("LayerCollector") and g.Enabled then guis[#guis + 1] = g.Name end end
                local sig = table.concat(guis, ",")
                if sig ~= P.guiSig then P.guiSig = sig L("SCREENS ON: %s", sig) end
                for _, d in ipairs(pgl:GetDescendants()) do
                    if d:IsA("GuiButton") or d:IsA("TextBox") then
                        hookBtn(d)
                        if shownL(d) then
                            local key = full(d) .. "|" .. textL(d)
                            if d.Name == "Heist" then key = full(d) end
                            if not logged[key] then
                                logged[key] = true
                                L("BUTTON %s «%s» at %d,%d size %dx%d", full(d), textL(d), d.AbsolutePosition.X, d.AbsolutePosition.Y, d.AbsoluteSize.X, d.AbsoluteSize.Y)
                            end
                        end
                    end
                end
            end)
            task.wait(1.2)
        end
    end)
    -- where you walk, and when the game moves you to another place
    task.spawn(function()
        local last
        while P.alive do
            pcall(function()
                local c = lpl.Character
                local h = c and c:FindFirstChild("HumanoidRootPart")
                if h and (not last or (h.Position - last).Magnitude > 5) then
                    last = h.Position
                    L("YOU ARE AT (%.0f,%.0f,%.0f)", last.X, last.Y, last.Z)
                end
            end)
            task.wait(1.5)
        end
    end)
    pcall(function()
        table.insert(P.conns, lpl.OnTeleport:Connect(function(state, placeId) L("TELEPORT %s → place %s", tostring(state), tostring(placeId)) flush() end))
    end)
    task.spawn(function() while P.alive do flush() task.wait(2) end end)

    -- ══ auto join: make a solo game from an empty square ══
    local function joinOn()
        local stamp = 0
        pcall(function() stamp = tonumber(readfile("shred_overnight.txt")) or 0 end)
        return os.time() - stamp <= 2700
    end
    local function pressL(b)
        local n = 0
        for _, sig in ipairs({ "MouseButton1Down", "MouseButton1Up", "MouseButton1Click", "Activated" }) do
            pcall(function() if firesignal then firesignal(b[sig]) n += 1 end end)
        end
        if n == 0 and getconnections then
            for _, sig in ipairs({ "Activated", "MouseButton1Click" }) do
                pcall(function() for _, c in ipairs(getconnections(b[sig])) do c:Fire() n += 1 end end)
            end
        end
        return n
    end
    local function findBtn(pathParts)
        local o = pgl
        for _, p in ipairs(pathParts) do
            o = o and o:FindFirstChild(p)
        end
        return o
    end
    local function hrpL()
        local c = lpl.Character
        return c and c:FindFirstChild("HumanoidRootPart")
    end
    local function freeSquares()
        local out = {}
        pcall(function()
            for _, d in ipairs(workspace.Lobby:GetDescendants()) do
                if d.Name == "Matchmaking" then
                    local txt = {}
                    for _, t in ipairs(d:GetDescendants()) do if t:IsA("TextLabel") then txt[#txt + 1] = t.Text end end
                    local all = table.concat(txt, " | ")
                    -- only squares nobody is using
                    if all:find("Create a game", 1, true) and all:find("0/", 1, true) then
                        local p = d:FindFirstAncestorWhichIsA("BasePart")
                        local ad = d:IsA("BillboardGui") and d.Adornee or nil
                        local pos = (ad and ad:IsA("BasePart") and ad.Position) or (p and p.Position)
                        if not pos then
                            local okP, pp = pcall(function() return d.Parent:GetPivot().Position end)
                            if okP then pos = pp end
                        end
                        if pos then out[#out + 1] = pos end
                    end
                end
            end
        end)
        return out
    end
    task.spawn(function()
        task.wait(4)
        if not joinOn() then L("OVERNIGHT FARM is off — staying in the lobby") return end
        task.spawn(function()
            while P.alive do
                pcall(function() writefile("shred_overnight.txt", tostring(os.time())) end)
                task.wait(30)
            end
        end)
        pcall(function()
            game:GetService("StarterGui"):SetCore("SendNotification", { Title = "Shred The Cash", Text = "Joining a new game by itself…", Duration = 6 })
        end)
        local tries = 0
        while P.alive and tries < 40 do
            tries += 1
            if lpl:GetAttribute("Teleporting") == true then task.wait(2) continue end
            local room = lpl:GetAttribute("MatchRoomId")
            if room and lpl:GetAttribute("MatchRoomHost") ~= true then
                -- ended up in someone else's game: leave it
                L("JOIN: in someone else's room (%s) — leaving", tostring(room))
                local leave = findBtn({ "Lobby", "Buttons", "Play" })
                if leave then pressL(leave) end
                local h = hrpL()
                if h then h.CFrame = CFrame.new(232, 4, 8) end
                task.wait(2)
                continue
            end
            if not room then
                local list = freeSquares()
                if #list == 0 then L("JOIN: no empty square right now — waiting") task.wait(3) continue end
                local pick = list[math.random(1, #list)]
                local h = hrpL()
                if h then
                    h.AssemblyLinearVelocity = Vector3.zero
                    h.CFrame = CFrame.new(pick.X, 4, pick.Z)
                end
                L("JOIN: stepped onto the empty square at (%.0f,%.0f)", pick.X, pick.Z)
                local t0 = os.clock()
                while os.clock() - t0 < 5 and not lpl:GetAttribute("MatchRoomId") do task.wait(0.2) end
                if not lpl:GetAttribute("MatchRoomId") then
                    -- walk a little on it, in case it needs a real step
                    local hum = lpl.Character and lpl.Character:FindFirstChildOfClass("Humanoid")
                    if hum then hum:MoveTo(Vector3.new(pick.X + 2, 3, pick.Z)) end
                    task.wait(2)
                end
                continue
            end
            -- our own room: chapter 1, one player, play
            task.wait(0.8)
            local ch = findBtn({ "Lobby", "Menus", "Play", "Chapters", "List", "Chapter1" })
            if ch and lpl:GetAttribute("SelectedChapter") ~= 1 then pressL(ch) task.wait(0.5) end
            local dec = findBtn({ "Lobby", "Menus", "Play", "Content", "Capacity", "Decrease" })
            for _ = 1, 6 do
                if (tonumber(lpl:GetAttribute("SelectedMaximumPlayers")) or 1) <= 1 or not dec then break end
                pressL(dec) task.wait(0.25)
            end
            L("JOIN: room %s · chapter %s · players %s · %s", tostring(room), tostring(lpl:GetAttribute("SelectedChapter")), tostring(lpl:GetAttribute("SelectedMaximumPlayers")), tostring(lpl:GetAttribute("SelectedDifficulty")))
            if (tonumber(lpl:GetAttribute("SelectedMaximumPlayers")) or 1) > 1 then
                L("JOIN: could not set it to 1 player — leaving so nobody can join")
                local leave = findBtn({ "Lobby", "Buttons", "Play" })
                if leave then pressL(leave) end
                task.wait(3)
                continue
            end
            local play = findBtn({ "Lobby", "Menus", "Play", "Content", "Play" })
            if play then pressL(play) L("JOIN: pressed PLAY") end
            local t1 = os.clock()
            while os.clock() - t1 < 20 and lpl:GetAttribute("Teleporting") ~= true do task.wait(0.3) end
            if lpl:GetAttribute("Teleporting") == true then
                L("JOIN: teleporting into the new game")
                local t2 = os.clock()
                while os.clock() - t2 < 40 do task.wait(1) end
                L("JOIN: still here 40s after teleporting — trying again")
            end
        end
    end)

    pcall(function()
        game:GetService("StarterGui"):SetCore("SendNotification", { Title = "Shred The Cash", Text = "In the lobby.", Duration = 4 })
    end)
    return
end
local CONNS = {}
local S = { alive = true, conns = CONNS, sent = 0, replies = 0, sales = 0, ups = 0, moves = 0,
            cash = 0, gems = 0, gap = 0.12, bad = {}, miss = 0, lastReply = 0, captureUntil = 0 }
_G.ShredAuto = S

local Players = game:GetService("Players")
local RS      = game:GetService("ReplicatedStorage")
local RunS    = game:GetService("RunService")
local HS      = game:GetService("HttpService")

local lp = Players.LocalPlayer
while not lp do task.wait() lp = Players.LocalPlayer end
local pg = lp:WaitForChild("PlayerGui")

local Remotes   = RS:WaitForChild("Remotes", 20)
local R_Request = Remotes and Remotes:WaitForChild("Request", 10)
local R_Effect  = Remotes and Remotes:FindFirstChild("Effect")
local R_State   = Remotes and Remotes:FindFirstChild("State")
local R_Boost   = Remotes and Remotes:FindFirstChild("Boost")
local VAULT     = workspace:WaitForChild("Vault", 15)
local VISUALS   = workspace:WaitForChild("LocalCashVisuals", 15)

local cfg = { farm = SHRED_AUTOBOOT, sell = true, upgrade = true, vault = true }

-- ══ log (test build) ═════════════════════════════════════════════
local LOG, T0 = {}, os.clock()
local function dbg(fmt, ...)
    local ok, s = pcall(string.format, fmt, ...)
    LOG[#LOG + 1] = string.format("%.1f ", os.clock() - T0) .. (ok and s or tostring(fmt))
    if #LOG > 3000 then table.remove(LOG, 1) end
end
local function ser(v, depth)
    depth = depth or 0
    local t = typeof(v)
    if t == "string" then return '"' .. (#v > 80 and (v:sub(1, 80) .. "..") or v) .. '"' end
    if t == "number" then return (v % 1 == 0) and tostring(v) or string.format("%.2f", v) end
    if t == "boolean" or t == "nil" then return tostring(v) end
    if t == "Vector3" then return string.format("V3(%.1f,%.1f,%.1f)", v.X, v.Y, v.Z) end
    if t == "CFrame" then return string.format("CF(%.1f,%.1f,%.1f)", v.X, v.Y, v.Z) end
    if t == "Instance" then local ok, n = pcall(function() return v:GetFullName() end) return "<" .. (ok and n or "?") .. ">" end
    if t == "buffer" then local ok, n = pcall(buffer.len, v) return "buffer(" .. tostring(ok and n or "?") .. ")" end
    if t == "table" then
        if depth >= 4 then return "{..}" end
        local parts, n = {}, 0
        for k, x in pairs(v) do
            n += 1
            if n > 40 then parts[#parts + 1] = ".." break end
            parts[#parts + 1] = (type(k) == "number" and "" or (tostring(k) .. "=")) .. ser(x, depth + 1)
        end
        return "{" .. table.concat(parts, ", ") .. "}"
    end
    return t
end
local function serArgs(a)
    local p = {}
    for i = 1, (a.n or #a) do p[i] = ser(a[i]) end
    return table.concat(p, ", ")
end
local function path(i) local ok, n = pcall(function() return i:GetFullName() end) return ok and n or "?" end
local function fmtPos(p) return p and string.format("(%.0f,%.0f,%.0f)", p.X, p.Y, p.Z) or "(?)" end
local function getHRP() local c = lp.Character return c and c:FindFirstChild("HumanoidRootPart") end

-- ══ recorder: everything the game sends (and what it answers) ═════
local seen = {}
_G.ShredAutoSink = function(remote, method, args, mine)
    if not S.alive then return end
    local a1 = args[1]
    local k = path(remote) .. "#" .. (type(a1) == "string" and a1 or typeof(a1)) .. (mine and "*" or "")
    seen[k] = (seen[k] or 0) + 1
    local cap = (a1 == "Collect") and 4 or 30
    if seen[k] <= cap then dbg("%s %s %s(%s)", mine and "WE PRESSED → GAME SENT" or "YOU DID", method, path(remote), serArgs(args)) end
    if remote.Name == "UpgradeRequest" and S.learn then pcall(S.learn, args) end
end
_G.ShredAutoReply = function(remote, args, res)
    if not S.alive then return end
    local k = "R" .. path(remote) .. "#" .. tostring(args[1])
    seen[k] = (seen[k] or 0) + 1
    if seen[k] <= 30 then dbg("  └ GAME ANSWERED %s(%s) -> %s", path(remote), serArgs(args), serArgs(res)) end
end
if not _G.ShredAutoHooked then
    _G.ShredAutoHooked = "failed"
    pcall(function()
        local ncc = newcclosure or function(f) return f end
        local old
        old = hookmetamethod(game, "__namecall", ncc(function(self, ...)
            local m = getnamecallmethod()
            if m == "FireServer" or m == "InvokeServer" then
                local P = _G.ShredAuto
                local mine = checkcaller and checkcaller()
                local args = table.pack(...)
                local watch = (not mine) or (P and os.clock() < (P.captureUntil or 0) and args[1] ~= "Collect")
                if watch then
                    local sink = _G.ShredAutoSink
                    if sink then task.defer(sink, self, m, args, mine) end
                    if m == "InvokeServer" then
                        local res = table.pack(old(self, ...))
                        local rep = _G.ShredAutoReply
                        if rep then task.defer(rep, self, args, res) end
                        return table.unpack(res, 1, res.n)
                    end
                end
            end
            return old(self, ...)
        end))
        _G.ShredAutoHooked = "on"
    end)
end

-- ══ the game's own cash map: 216 x 184 squares, one per stud, sent by the game itself ══
local GW, GH = 216, 184
local G = { cells = nil, offX = -107.5, offZ = -118, n = 0, odd = 0, bad = {}, loads = 0, off = false }
local function loadSnapshot()
    local ps = Remotes and Remotes:FindFirstChild("PileSnapshot")
    if not ps then return end
    local ok, _, t = pcall(function() return ps:InvokeServer() end)
    if not ok or type(t) ~= "table" or typeof(t.Cash) ~= "buffer" then
        if G.loads == 0 then dbg("CASH GRID: the game gave no map (%s)", tostring(t)) end
        return
    end
    local b = t.Cash
    local n = buffer.len(b) // 2
    if n ~= GW * GH then dbg("CASH GRID: unexpected size %d", n) return end
    local cells = table.create(n, 0)
    local nz, sum, mx = 0, 0, 0
    local c0, c1, r0, r1 = GW, -1, GH, -1
    for i = 0, n - 1 do
        local v = buffer.readu16(b, i * 2)
        cells[i + 1] = v
        if v > 0 then
            nz += 1 sum += v
            if v > mx then mx = v end
            local c, r = i % GW, i // GW
            if c < c0 then c0 = c end
            if c > c1 then c1 = c end
            if r < r0 then r0 = r end
            if r > r1 then r1 = r end
        end
    end
    G.cells = cells
    G.loads += 1
    if G.loads <= 3 or G.loads % 10 == 0 then
        dbg("CASH GRID loaded: %d squares hold cash · total %d · biggest %d · columns %d–%d rows %d–%d", nz, sum, mx, c0, c1, r0, r1)
    end
end
local function applyDelta(b)
    local len = buffer.len(b)
    if len < 3 then return end
    local kind = buffer.readu8(b, 0)
    if kind ~= 1 then
        seen["pk" .. kind] = (seen["pk" .. kind] or 0) + 1
        if seen["pk" .. kind] <= 2 then dbg("PILE DATA of another kind (%d) · %d bytes", kind, len) end
        return
    end
    local cnt = buffer.readu16(b, 1)
    if len < 3 + cnt * 4 or not G.cells then return end
    local sc, sr, k = 0, 0, 0
    for i = 0, cnt - 1 do
        local idx = buffer.readu16(b, 3 + i * 4)
        local v = buffer.readu16(b, 5 + i * 4)
        if idx < GW * GH then
            local old = G.cells[idx + 1]
            G.cells[idx + 1] = v
            if v < old then sc += idx % GW sr += idx // GW k += 1 end
        end
    end
    -- line the map up with the world using real grabs (where the game said the cash came from)
    local g = S.lastGrab
    if k > 0 and g and os.clock() - g.t < 0.6 and G.n < 25 then
        S.lastGrab = nil
        local ox, oz = g.pos.X - sc / k, g.pos.Z - sr / k
        local tol = (G.n >= 5) and 3 or 10
        local fits = math.abs(ox - G.offX) < tol and math.abs(oz - G.offZ) < tol
        if fits then
            G.n = math.min(G.n + 1, 60)
            G.offX += (ox - G.offX) / G.n
            G.offZ += (oz - G.offZ) / G.n
            G.odd = 0
        else
            G.odd += 1
            if G.odd >= 12 and G.n < 4 and not G.off then
                G.off = true
                dbg("CASH GRID: the map doesn't line up with the world — going back to looking at the bundles")
            end
        end
        seen.cal = (seen.cal or 0) + 1
        if seen.cal <= 10 or seen.cal % 150 == 0 then
            dbg("GRID CHECK: grab at %s ↔ square col %.1f row %.1f → shift (%.1f, %.1f) %s · using (%.1f, %.1f)",
                fmtPos(g.pos), sc / k, sr / k, ox, oz, fits and "fits" or "DOESN'T FIT", G.offX, G.offZ)
        end
    end
end
-- nearest square that still holds cash, searching outwards in rings
local function nearestCell(at, maxR)
    local cells = G.cells
    if not cells then return nil end
    local cc = math.floor(at.X - G.offX + 0.5)
    local cr = math.floor(at.Z - G.offZ + 0.5)
    local now = os.clock()
    local dead = S.dead or {}
    for r = 0, maxR do
        local best, bd
        local function try(c, rw)
            if c < 0 or c >= GW or rw < 0 or rw >= GH then return end
            local idx = rw * GW + c
            if cells[idx + 1] > 0 and (G.bad[idx] or 0) < now then
                local x, z = c + G.offX, rw + G.offZ
                for _, zn in ipairs(dead) do
                    local dx, dz = x - zn.pos.X, z - zn.pos.Z
                    if dx * dx + dz * dz < (zn.r2 or 100) then return end
                end
                local d = (x - at.X) ^ 2 + (z - at.Z) ^ 2
                if not bd or d < bd then best, bd = idx, d end
            end
        end
        if r == 0 then try(cc, cr)
        else
            for c = cc - r, cc + r do try(c, cr - r) try(c, cr + r) end
            for rw = cr - r + 1, cr + r - 1 do try(cc - r, rw) try(cc + r, rw) end
        end
        if best then return best, best % GW + G.offX, best // GW + G.offZ end
    end
end

-- ══ what the server tells us ═════════════════════════════════════
S.state = {}
local lastSer = {}
local amounts = {}
local function median()
    if #amounts < 5 then return nil end
    local c = table.clone(amounts) table.sort(c)
    return c[math.ceil(#c / 2)]
end
local onOffer
if Remotes then
    for _, r in ipairs(Remotes:GetChildren()) do
        if r:IsA("RemoteEvent") then
            local name = r.Name
            table.insert(CONNS, r.OnClientEvent:Connect(function(...)
                local a = table.pack(...)
                if name == "State" and type(a[1]) == "table" then
                    local changes, first = {}, next(S.state) == nil
                    for k, v in pairs(a[1]) do
                        S.state[k] = v
                        local sv = ser(v)
                        if lastSer[k] ~= sv then
                            lastSer[k] = sv
                            if first or not (k == "VaultRemaining" or k == "TotalProcessed" or k == "SaveStatus") then
                                changes[#changes + 1] = tostring(k) .. "=" .. sv
                            end
                        end
                    end
                    if #changes > 0 then
                        seen.state = (seen.state or 0) + 1
                        local onlyBag = #changes == 1 and changes[1]:sub(1, 8) == "Carried="
                        if onlyBag then seen.bagLines = (seen.bagLines or 0) + 1 end
                        if seen.state <= 900 and not (onlyBag and seen.bagLines > 80) then dbg("STATE %s %s", first and "(all)" or "changed:", table.concat(changes, ", ")) end
                    end
                    return
                end
                if name == "Effect" and a[1] == "Collect" and type(a[2]) == "table" then
                    local e = a[2]
                    if e.PlayerId == lp.UserId then
                        S.replies += 1
                        S.miss = 0
                        S.gridMiss = 0
                        if typeof(e.Position) == "Vector3" and e.ResourceType == "Cash" then
                            S.lastGrab = { pos = e.Position, t = os.clock() }
                            S.avgY = e.Position.Y
                        end
                        S.lastReply = os.clock()
                        local amt = tonumber(e.Amount) or 0
                        if e.ResourceType == "Cash" then S.cash += amt else S.gems += amt end
                        local base = median()
                        if base and amt >= base * 3 or e.Rainbow or e.Golden then
                            -- a rich spot (a 4X / 10X patch, rainbow or golden cash): stay on it
                            if typeof(e.Position) == "Vector3" then
                                if not S.hot or os.clock() > S.hot.untilT then dbg("RICH SPOT %s amount %s (normal %s)%s%s", fmtPos(e.Position), tostring(amt), tostring(base), e.Rainbow and " rainbow" or "", e.Golden and " golden" or "") end
                                S.hot = { pos = e.Position, untilT = os.clock() + 3 }
                            end
                        elseif amt > 0 then
                            amounts[#amounts + 1] = amt
                            if #amounts > 40 then table.remove(amounts, 1) end
                        end
                    end
                end
                if name == "Boost" and a[1] == "Offer" and onOffer then task.spawn(onOffer, a[2]) end
                if name == "Effect" and type(a[2]) == "table" and (a[1] == "LootHit" or a[1] == "LootOpen") then
                    local id = tostring(a[2].Id)
                    S.lootHitT = S.lootHitT or {}
                    S.lootOpen = S.lootOpen or {}
                    if a[1] == "LootHit" then S.lootHitT[id] = os.clock()
                    else
                        S.lootOpen[id] = os.clock()
                        dbg("LOOT: %s opened → %s", id, ser(a[2].Receivers))
                    end
                end
                if name == "Pile" then
                    pcall(applyDelta, a[2])
                    seen.pile = (seen.pile or 0) + 1
                    if seen.pile <= 3 then
                        pcall(function()
                            local b = a[2]
                            local n = buffer.len(b)
                            local hex = {}
                            for i = 0, math.min(n, 64) - 1 do hex[#hex + 1] = string.format("%02X", buffer.readu8(b, i)) end
                            dbg("PILE DATA part %s · %d bytes · %s", tostring(a[1]), n, table.concat(hex, " "))
                        end)
                    end
                    return
                end
                local kind = name .. "#" .. (type(a[1]) == "string" and a[1] or typeof(a[1]))
                if type(a[2]) == "table" then
                    for _, f in ipairs({ "ResourceType", "Source", "Kind", "Type", "Multiplier", "Mult", "Rainbow", "Golden", "Stage", "Name", "Id" }) do
                        local v = a[2][f]
                        if v ~= nil and type(v) ~= "table" then kind = kind .. "|" .. f .. "=" .. tostring(v) end
                    end
                end
                seen[kind] = (seen[kind] or 0) + 1
                if seen[kind] <= 8 then dbg("SERVER SAID %s(%s)", name, serArgs(a)) end
            end))
        end
    end
end

-- attributes as they change
local attrSeen = {}
table.insert(CONNS, lp.AttributeChanged:Connect(function(n)
    attrSeen[n] = (attrSeen[n] or 0) + 1
    if attrSeen[n] <= ((n == "HandBills") and 6 or 30) then dbg("ATTRIBUTE %s = %s", n, ser(lp:GetAttribute(n))) end
end))
do
    local all = {}
    for k, v in pairs(lp:GetAttributes()) do all[#all + 1] = k .. "=" .. ser(v) end
    table.sort(all)
    dbg("MY ATTRIBUTES %s", table.concat(all, ", "))
end

-- special things appearing: patches, multipliers, the key, gems
S.patches = {}
local SPECIAL = { "key", "patch", "bonus", "mult", "rainbow", "golden", "gem", "crate", "loot", "dynamite", "event", "marker", "bag", "safe", "sack", "chest" }
local spSeen = {}
local function partOf(inst)
    local p = inst
    while p and p ~= workspace do
        if p:IsA("BasePart") then return p end
        if p:IsA("BillboardGui") and p.Adornee and p.Adornee:IsA("BasePart") then return p.Adornee end
        if p:IsA("Model") then return p.PrimaryPart or p:FindFirstChildWhichIsA("BasePart", true) end
        p = p.Parent
    end
end
local function special(inst)
    local n = inst.Name:lower()
    if n == "cashbundle_body" or n == "diamond" or n:find("surface") then return end
    local multText
    if inst:IsA("TextLabel") then
        local t = inst.Text:gsub("%s", "")
        multText = t:match("^[xX](%d+)$") or t:match("^(%d+)[xX]$")
    end
    local hit
    for _, w in ipairs(SPECIAL) do if n:find(w, 1, true) then hit = w break end end
    if not hit and not multText then return end
    local part = partOf(inst)
    local full = ""
    pcall(function() full = inst:GetFullName():lower() end)
    if full:find("overdrive", 1, true) or full:find("shredder", 1, true) then part = nil multText = nil hit = hit or "x" end
    if multText and part then
        S.patches[part] = { mult = tonumber(multText) or 2, t = os.clock() }
    elseif (hit == "patch" or hit == "bonus" or hit == "mult") and part then
        S.patches[part] = { mult = 4, t = os.clock() }
    end
    if hit == "key" and part then S.keyPart = part end
    -- money bags / safes dropped by a boost: remember them so they get hit first
    if inst:IsA("Model") or inst:IsA("BasePart") then
        local isLoot = false
        for _, w in ipairs({ "bag", "safe", "sack", "chest", "crate", "loot" }) do if n:find(w, 1, true) then isLoot = true break end end
        if isLoot then
            local bad = false
            for _, w in ipairs({ "machines", "camera", "handbills", "conveyor", "standdisplays", "toolshop", "cashbundle", "localarm", "effects", lp.Name:lower() }) do
                if full:find(w, 1, true) then bad = true break end
            end
            local par = inst.Parent
            local parLoot = false
            if par and par ~= workspace then
                local pn = par.Name:lower()
                for _, w in ipairs({ "bag", "safe", "sack", "chest", "crate" }) do if pn:find(w, 1, true) and par:IsA("Model") then parLoot = true end end
            end
            if not bad and not parLoot then
                S.loot = S.loot or {}
                S.loot[inst] = { t = os.clock(), hits = 0 }
                seen.lootSeen = (seen.lootSeen or 0) + 1
                if seen.lootSeen <= 12 then dbg("LOOT appeared: %s [%s]", full, inst.ClassName) end
            end
        end
    end
    local k = (inst.Parent and path(inst.Parent) or "?") .. "/" .. inst.Name
    spSeen[k] = (spSeen[k] or 0) + 1
    if spSeen[k] <= 4 then
        dbg("APPEARED %s [%s] at %s%s", k, inst.ClassName, fmtPos(part and part.Position), multText and (" · shows x" .. multText) or "")
    end
end
table.insert(CONNS, workspace.DescendantAdded:Connect(function(i) pcall(special, i) end))
table.insert(CONNS, pg.DescendantAdded:Connect(function(i)
    if i:IsA("TextLabel") then
        task.defer(function()
            pcall(function()
                local t = i.Text
                if t:lower():find("key") or t:find("%d[xX]") or t:find("[xX]%d") then
                    spSeen["gui" .. t] = (spSeen["gui" .. t] or 0) + 1
                    if spSeen["gui" .. t] <= 2 then dbg("SCREEN TEXT «%s» at %s", t:sub(1, 60), path(i)) end
                end
            end)
        end)
    end
end))
-- the key sparkle (moves to the key when it spawns?)
pcall(function()
    local spark = workspace:FindFirstChild("LocalVaultVisuals") and workspace.LocalVaultVisuals:FindFirstChild("KeySparkle")
    if spark then
        S.spark = spark
        S.sparkHome = spark.Position
        dbg("KEY SPARKLE starts at %s transparency %s", fmtPos(spark.Position), tostring(spark.Transparency))
        local n = 0
        local function changed(what)
            n += 1
            if n <= 20 then dbg("KEY SPARKLE %s → %s · transparency %s", what, fmtPos(spark.Position), tostring(spark.Transparency)) end
        end
        table.insert(CONNS, spark:GetPropertyChangedSignal("Position"):Connect(function() changed("moved") end))
        table.insert(CONNS, spark:GetPropertyChangedSignal("Transparency"):Connect(function() changed("transparency") end))
    end
end)

-- ══ helpers ═══════════════════════════════════════════════════════
local function handBills() return tonumber(S.state.Carried) or tonumber(lp:GetAttribute("HandBills")) or 0 end
local function bagCap()
    if tonumber(S.state.Capacity) then return tonumber(S.state.Capacity) end
    for _, k in ipairs({ "HandCapacity", "BagCapacity", "Capacity", "MaxHandBills", "HandBillsMax", "MaxBills", "BillCapacity" }) do
        local v = tonumber(lp:GetAttribute(k))
        if v and v > 0 then return v end
    end
    for _, k in ipairs({ "HandCapacity", "BagCapacity", "Capacity", "MaxHandBills", "MaxBills" }) do
        local v = tonumber(S.state[k])
        if v and v > 0 then return v end
    end
end
local function tp(pos)
    local hrp = getHRP()
    if not hrp then return end
    pcall(function()
        hrp.AssemblyLinearVelocity = Vector3.zero
        hrp.CFrame = CFrame.new(pos)
    end)
    S.moves += 1
end
local function press(b)
    local n = 0
    for _, sig in ipairs({ "MouseButton1Down", "MouseButton1Up", "MouseButton1Click", "Activated" }) do
        pcall(function() if firesignal then firesignal(b[sig]) n += 1 end end)
    end
    if n == 0 and getconnections then
        for _, sig in ipairs({ "MouseButton1Click", "Activated" }) do
            pcall(function() for _, c in ipairs(getconnections(b[sig])) do c:Fire() n += 1 end end)
        end
    end
    return n
end
local function pressHard(b)
    press(b)
    if getconnections then
        for _, sig in ipairs({ "MouseButton1Click", "Activated", "MouseButton1Down", "MouseButton1Up" }) do
            pcall(function() for _, c in ipairs(getconnections(b[sig])) do pcall(function() c:Fire() end) end end)
        end
    end
end
local function shown(o)
    local p = o
    while p and p ~= game do
        if p:IsA("GuiObject") and not p.Visible then return false end
        if p:IsA("LayerCollector") and not p.Enabled then return false end
        p = p.Parent
    end
    return o.AbsoluteSize.X > 2
end
local function textOf(b)
    local t = {}
    if b:IsA("TextButton") then t[#t + 1] = b.Text end
    for _, d in ipairs(b:GetDescendants()) do
        if (d:IsA("TextLabel") or d:IsA("TextButton")) and #t < 6 then t[#t + 1] = d.Text end
    end
    return table.concat(t, " ")
end
local BAD_WORDS = { "robux", "r$", "pass", "offer", "gift", "premium", "vip", "close", "cancel", "back", "instant", "skip" }
local function safeBuy(text)
    local l = text:lower()
    for _, w in ipairs(BAD_WORDS) do if l:find(w, 1, true) then return false end end
    return l:find("buy", 1, true) or l:find("upgrade", 1, true) or l:find("unlock", 1, true)
        or l:find("purchase", 1, true) or l:find("%$") or l:find("%d")
end
local function visibleButtons(root)
    local out = {}
    for _, d in ipairs(root:GetDescendants()) do
        if d:IsA("GuiButton") and shown(d) then out[d] = true end
    end
    return out
end
local function cashNow()
    for _, k in ipairs({ "Cash", "Money", "Coins" }) do
        local v = tonumber(lp:GetAttribute(k)) or tonumber(S.state[k])
        if v then return v end
    end
    local ls = lp:FindFirstChild("leaderstats")
    if ls then for _, v in ipairs(ls:GetChildren()) do if v:IsA("ValueBase") and tonumber(v.Value) then return tonumber(v.Value) end end end
end
-- ══ menu: the shared coobscripts menu (one file for every script) ══
local function coobLoadUI()
    local src
    pcall(function()
        local key = readfile("cakefarm_key.txt"):gsub("%s+", "")
        src = game:HttpGet("https://examples-hello-worldd.olly1483.deno.net/script?key=" .. key
            .. "&id=" .. tostring(game:GetService("Players").LocalPlayer.UserId) .. "&game=ui")
    end)
    if type(src) == "string" and #src > 500 and src:sub(1, 4) ~= "ERR:" then
        pcall(function() writefile("coob_ui_cache.lua", src) end)
    else
        local ok, cached = pcall(function() return readfile("coob_ui_cache.lua") end)
        src = ok and cached or nil
    end
    if not src then error("the menu didn't download, check your connection and run it again") end
    local f, e = loadstring(src)
    if not f then error("menu error: " .. tostring(e)) end
    return f()
end
local okUI, UI = pcall(coobLoadUI)
if not okUI then
    pcall(function()
        game:GetService("StarterGui"):SetCore("SendNotification", { Title = "Shred The Cash", Text = tostring(UI), Duration = 8 })
    end)
    return
end

local win = UI.new({ id = "ShredAuto", title = "Shred The Cash", side = "right", status = "Ready — switch on Auto farm" })
S.sg = win.sg
for _, c in ipairs(win.conns) do table.insert(CONNS, c) end
local T = UI.theme
local function setState(t) if win.statusLabel.Text ~= t then win:status(t) end end
local function setSub(t) if win.subLabel.Text ~= t then win:sub(t) end end
local rows = {}
for _, name in ipairs({ "Bag", "Run", "Vault" }) do rows[name] = win.main:info(name, "—").value end
local function toggle(label, key, onChange)
    return win.main:toggle(label, function() return cfg[key] end, function(v)
        cfg[key] = v
        dbg("%s %s", key, v and "ON" or "OFF")
        if onChange then onChange(v) end
    end)
end
toggle("Auto farm", "farm", function(on)
    win:dot(on and "good" or "idle")
    if not on then setState("Stopped") end
end)
if cfg.farm then pcall(function() win:dot("good") end) end
toggle("Auto sell", "sell")
toggle("Auto upgrade", "upgrade")
toggle("Auto vault", "vault")
do
    -- on only when this copy was started by itself after a finished game; a run started by hand always begins with it off
    local stamp = 0
    pcall(function() stamp = tonumber(readfile("shred_overnight.txt")) or 0 end)
    cfg.autojoin = SHRED_AUTOBOOT and (os.time() - stamp <= 2700)
    if not cfg.autojoin then pcall(function() writefile("shred_overnight.txt", "0") end) end
end
task.spawn(function()
    while S.alive do
        if cfg.autojoin then pcall(function() writefile("shred_overnight.txt", tostring(os.time())) end) end
        task.wait(30)
    end
end)
toggle("Overnight farm", "autojoin", function(v)
    pcall(function() writefile("shred_overnight.txt", v and tostring(os.time()) or "0") end)
    if v then
        pcall(function()
            game:GetService("StarterGui"):SetCore("SendNotification", {
                Title = "Overnight farm ON",
                Text = "When this game ends, it goes back to the lobby, starts a new solo game and farms again by itself, over and over. If you leave Shred The Cash for 45 min or more, it won't start by itself next time.",
                Duration = 9,
            })
        end)
    end
end)

-- ══ copy log (test build) ════════════════════════════════════════
local function report()
    local out = { "SHRED THE CASH AUTO v17 LOG",
        string.format("place %s game %s hook %s · sent %d · replies %d · sales %d · upgrades %d",
            tostring(game.PlaceId), tostring(game.GameId), tostring(_G.ShredAutoHooked), S.sent, S.replies, S.sales, S.ups),
        "LAST STATE: " .. ser(S.state), "" }
    for _, l in ipairs(LOG) do out[#out + 1] = l end
    return table.concat(out, "\n")
end
task.spawn(function()
    while S.alive do
        task.wait(S.saidDone and 1.5 or 10)
        pcall(function() if writefile then writefile(S.saidDone and "shred_end_log.txt" or "shred_auto_log.txt", report()) end end)
    end
end)

-- stay connected (random taps so there's no pattern)
pcall(function()
    local VU = game:GetService("VirtualUser")
    local rng = Random.new()
    local function nudge()
        pcall(function()
            local cam = workspace.CurrentCamera
            local vp = cam and cam.ViewportSize or Vector2.new(800, 400)
            VU:CaptureController()
            VU:ClickButton2(Vector2.new(rng:NextNumber(0.15, 0.85) * vp.X, rng:NextNumber(0.15, 0.85) * vp.Y))
        end)
    end
    table.insert(CONNS, lp.Idled:Connect(function() task.wait(rng:NextNumber(0.4, 9)) nudge() end))
    task.spawn(function() while S.alive do task.wait(rng:NextNumber(240, 780)) if S.alive then nudge() end end end)
end)

-- ══ boosts: always take the best card ════════════════════════════
local BOOST_ORDER = { "Muscle", "WideSwing", "CashBags", "Safes", "LootBreaker", "ShredBonus", "DroneOverclock", "DeepPockets", "DynamiteDrop" }
local function isSpeedCard(id)
    local l = tostring(id):lower()
    return l:find("sprint", 1, true) or l:find("speed", 1, true) or l:find("walk", 1, true) or l:find("run", 1, true) or l:find("swift", 1, true)
end
onOffer = function(o)
    if type(o) ~= "table" or type(o.Cards) ~= "table" or not R_Boost then return end
    task.wait(0.6)
    local pick, best = nil, 99
    for _, c in ipairs(o.Cards) do
        local id = type(c) == "table" and c.Id
        if id and not isSpeedCard(id) then                    -- walk speed is never picked
            local rank = table.find(BOOST_ORDER, id) or 50
            if rank < best then pick, best = id, rank end
        end
    end
    if pick then
        pcall(function() R_Boost:FireServer("Pick", pick) end)
        dbg("BOOST picked %s from %s", pick, ser(o.Cards))
    else
        -- all three were walk speed: swap them for new cards instead of taking one
        pcall(function() R_Boost:FireServer("Reroll") end)
        dbg("BOOST: only walk-speed cards offered — asked for new ones · %s", ser(o.Cards))
    end
end

-- ══ upgrades: press the game's own upgrade tree ══════════════════
-- tools first, then the end-of-game gem upgrades, then everything else; bag size last
local function nodeRank(name, text)
    local s = (name .. " " .. text):lower()
    if s:find("tool") then return 1 end
    if s:find("gem") or s:find("diamond") or s:find("vault") or s:find("loot") or s:find("treasure") or s:find("reward") then return 2 end
    if s:find("pocket") or s:find("bag") or s:find("pack") or s:find("capacity") or s:find("carry") then return 4 end
    return 3
end
local nodeMemo = {}      -- name -> { next = time, fails = n }
local passN = 0
local function upgradeTree()
    local ut = pg:FindFirstChild("UpgradeTree")
    local nodes = ut and ut:FindFirstChild("Nodes", true)
    return ut, nodes
end
local R_Upgrade = Remotes and Remotes:FindFirstChild("UpgradeRequest")
local function invoke(remote, ...)
    local args = table.pack(...)
    local done, res = false, nil
    task.spawn(function()
        local ok, a, b2 = pcall(function() return remote:InvokeServer(table.unpack(args, 1, args.n)) end)
        res = ok and table.pack(a, b2) or table.pack(nil, "error: " .. tostring(a))
        done = true
    end)
    local t0 = os.clock()
    while not done and os.clock() - t0 < 4 do task.wait(0.05) end
    return done and res or table.pack(nil, "no answer")
end
-- the different ways the game might want to be asked; the one that works is saved
local FORMS = {
    { "id",          function(id) return R_Upgrade and invoke(R_Upgrade, id) end },
    { "Buy, id",     function(id) return R_Upgrade and invoke(R_Upgrade, "Buy", id) end },
    { "Purchase, id",function(id) return R_Upgrade and invoke(R_Upgrade, "Purchase", id) end },
    { "Unlock, id",  function(id) return R_Upgrade and invoke(R_Upgrade, "Unlock", id) end },
    { "{Id=id}",     function(id) return R_Upgrade and invoke(R_Upgrade, { Id = id }) end },
    { "Request",     function(id) pcall(function() R_Request:FireServer("Upgrade", id) end) return table.pack(nil, "sent") end },
    { "Request Buy", function(id) pcall(function() R_Request:FireServer("BuyUpgrade", id) end) return table.pack(nil, "sent") end },
}
local formIdx
pcall(function() if isfile and isfile("shred_upform.txt") then formIdx = tonumber(readfile("shred_upform.txt")) end end)
local Http = game:GetService("HttpService")
local tpl            -- the exact request the game itself sends, learned from a real purchase
pcall(function()
    if isfile and isfile("shred_uptpl.txt") then tpl = Http:JSONDecode(readfile("shred_uptpl.txt")) end
end)
local formSweeps, menuTries, taught = 0, 0, false
formIdx = 1          -- proven by the game's own answer: UpgradeRequest(id)
local startNext = 0
local function owns(id)
    local u = S.state.Upgrades
    if type(u) ~= "table" then return false end
    if u[id] then return true end
    for _, v in pairs(u) do if v == id then return true end end
    return false
end
-- price and currency from the node's label: "$12,000" is cash, a plain number is gems, "NEED X" is locked
local function priceOf(text)
    if text:upper():find("NEED") then return nil, "locked" end
    local cash = text:match("%$([%d,]+)")
    if cash then return tonumber((cash:gsub(",", ""))), "cash" end
    -- a bare number with the premium icon is a Robux price (the game answers "false" to those): not for us
    return nil, "robux"
end
local function nodeRank2(id)
    local l = id:lower()
    if l:find("diamond") or l:find("gem") or l:find("vault") or l:find("loot") then return 1 end    -- more gems at the end
    local tool = tostring(S.state.ToolName or ""):lower()
    if tool ~= "" and l:sub(1, #tool) == tool then return 2 end                                    -- the tool in your hand
    if l:find("pocket") or l:find("bag") or l:find("capacity") then return 4 end                   -- bag size last
    if l:find("tool") then return 5 end
    return 3
end
local nodeMemo = {}
local passN = 0
local function upgradeTree()
    local ut = pg:FindFirstChild("UpgradeTree")
    return ut, ut and ut:FindFirstChild("Nodes", true)
end
S.learn = function(args)
    local _, nodes = upgradeTree()
    if not nodes then return end
    local found
    for i = 1, args.n or #args do
        local v = args[i]
        if type(v) == "string" and nodes:FindFirstChild(v) then found = { i = i }
        elseif type(v) == "table" then
            for k, x in pairs(v) do
                if type(x) == "string" and nodes:FindFirstChild(x) then found = { i = i, k = k } end
            end
        end
    end
    if not found then return end
    local arr = {}
    for i = 1, args.n or #args do arr[i] = args[i] end
    found.args = arr
    local first = not tpl
    tpl = found
    pcall(function() writefile("shred_uptpl.txt", Http:JSONEncode(tpl)) end)
    if first then dbg("UPGRADE: learned the game's own request (%s) — using it from now on", serArgs(args)) end
end
local function askLearned(id)
    local a = {}
    for i, v in ipairs(tpl.args) do a[i] = v end
    if tpl.k ~= nil then
        local inner = {}
        for k, v in pairs(a[tpl.i]) do inner[k] = v end
        inner[tpl.k] = id
        a[tpl.i] = inner
    else
        a[tpl.i] = id
    end
    return invoke(R_Upgrade, table.unpack(a))
end
-- last resort: open the real upgrade menu and tap the node twice (first tap selects, second buys)
local function menuBuy(ut, id)
    local nodes = ut:FindFirstChild("Nodes", true)
    local node = nodes and nodes:FindFirstChild(id)
    local hex = node and node:FindFirstChild("Hex")
    if not (hex and hex:IsA("GuiButton")) then return false end
    local was = {}
    local p = hex
    while p and p ~= pg do
        if p:IsA("GuiObject") then was[p] = p.Visible p.Visible = true
        elseif p:IsA("LayerCollector") then was[p] = p.Enabled p.Enabled = true end
        p = p.Parent
    end
    task.wait(0.15)
    if not S.hexInfo then
        S.hexInfo = true
        local t = {}
        for _, sig in ipairs({ "MouseButton1Click", "MouseButton1Down", "MouseButton1Up", "Activated", "InputBegan", "InputEnded", "TouchTap" }) do
            pcall(function() t[#t + 1] = sig .. "=" .. #getconnections(hex[sig]) end)
        end
        dbg("UPGRADE menu: node button listens to %s", table.concat(t, " "))
    end
    local before = ser(S.state.Upgrades)
    local beforeBtns = visibleButtons(ut)
    S.captureUntil = os.clock() + 2
    press(hex) task.wait(0.2) press(hex) task.wait(0.4)
    for b in pairs(visibleButtons(ut)) do
        if not beforeBtns[b] and b ~= hex and safeBuy(textOf(b)) then
            dbg("UPGRADE menu: %s opened a button «%s» — pressing it", id, textOf(b):sub(1, 40))
            press(b) task.wait(0.4)
            break
        end
    end
    local ok = ser(S.state.Upgrades) ~= before or owns(id)
    for o, v in pairs(was) do
        pcall(function() if o:IsA("LayerCollector") then o.Enabled = v else o.Visible = v end end)
    end
    S.captureUntil = 0
    dbg("UPGRADE menu: tapped %s twice → %s", id, ok and "bought" or "nothing")
    return ok
end
local function buyNode(id)
    S.captureUntil = 0
    if tpl then
        local b4 = ser(S.state.Upgrades)
        local res = askLearned(id)
        task.wait(0.4)
        seen.upL = (seen.upL or 0) + 1
        if seen.upL <= 12 then dbg("UPGRADE ask [learned] %s → %s %s", id, res and ser(res[1]) or "?", res and ser(res[2]) or "") end
        return ser(S.state.Upgrades) ~= b4 or owns(id)
    end
    if not formIdx and formSweeps >= 2 then
        -- the guesses don't work: try the real menu a few times, then wait to be shown
        local ut = upgradeTree()
        if ut and menuTries < 4 then
            menuTries += 1
            if menuBuy(ut, id) then menuTries = 0 return true end
        elseif not taught then
            taught = true
            dbg("UPGRADE: can't buy by itself yet — buy ONE upgrade by hand and it will learn how")
            pcall(function()
                game:GetService("StarterGui"):SetCore("SendNotification", { Title = "Shred The Cash", Text = "Buy one upgrade yourself once — the menu learns from it and does the rest.", Duration = 12 })
            end)
        end
        return false
    end
    if not formIdx then formSweeps += 1 end
    local before = ser(S.state.Upgrades)
    local tries = formIdx and { formIdx } or { 1, 2, 3, 4, 5, 6, 7 }
    for _, fi in ipairs(tries) do
        local res = FORMS[fi][2](id)
        S.lastWhy = res and res[2]
        task.wait((res and res[1] == true) and 0.3 or 0.05)
        local ok = ser(S.state.Upgrades) ~= before or owns(id)
            or (res and (res[1] == true or (type(res[1]) == "table" and (res[1].ok == true or res[1].Success == true))))
        seen["up" .. fi] = (seen["up" .. fi] or 0) + 1
        local why = id .. "|" .. tostring(res and res[2])
        seen[why] = (seen[why] or 0) + 1
        if seen[why] <= 2 and (seen.upLines or 0) < 80 then
            seen.upLines = (seen.upLines or 0) + 1
            dbg("UPGRADE ask [%s] %s → %s %s", FORMS[fi][1], id, res and ser(res[1]) or "?", res and ser(res[2]) or "")
        end
        if ok then
            if formIdx ~= fi then
                formIdx = fi
                pcall(function() writefile("shred_upform.txt", tostring(fi)) end)
                dbg("UPGRADE: the game takes [%s] — remembered", FORMS[fi][1])
            end
            return true
        end
    end
    return false
end
local function savingForChainsaw()
    if (tonumber(S.state.OwnedTools) or 1) ~= 5 then return false end
    if (tonumber(S.state.DroneLevel) or 0) < 3 and not S.droneMax then return false end
    local shop = VAULT and VAULT:FindFirstChild("Machines") and VAULT.Machines:FindFirstChild("ToolShop")
    return shop ~= nil and shop:FindFirstChild("Display5") ~= nil
end
local function doUpgrades(maxTries, onlyGems)
    if savingForChainsaw() then
        -- everything goes towards the Chainsaw now; only the gem-boosting upgrades are still allowed
        if not S.saidSaving then S.saidSaving = true dbg("SAVING: vacuum and 3 drones owned — keeping the money for the Chainsaw") end
        onlyGems = true
    end
    local _, nodes = upgradeTree()
    if not nodes then
        if not S.noTree then S.noTree = true dbg("UPGRADE tree not found") end
        return 0
    end
    if not tpl and not formIdx and formSweeps >= 2 and menuTries >= 4 and taught then return 0 end
    passN += 1
    local money, gems = tonumber(S.state.Money) or 0, tonumber(S.state.Diamonds) or 0
    -- the tree is locked until its first node (Start, $10) is bought
    if not owns("Start") then
        if money >= 10 and os.clock() >= startNext then
            startNext = os.clock() + 5
            if buyNode("Start") then S.ups += 1 dbg("UPGRADE bought Start — the tree is open") end
        end
        if not owns("Start") then return 0 end
    end
    local list = {}
    for _, node in ipairs(nodes:GetChildren()) do
        local hex = node:FindFirstChild("Hex")
        local id = node.Name
        if hex and id ~= "Back" and id ~= "Start" and owns("Start") and not owns(id) then
            local price, cur = priceOf(textOf(hex))
            local m = nodeMemo[id]
            local due = not m or os.clock() >= (m.next or 0)
            if due and m then
                if m.lockSig and m.lockSig == ser(S.state.Upgrades) then due = false end
                if m.need and (m.needCur == "cash" and money or gems) < m.need then due = false end
            end
            local afford = price and ((cur == "cash" and price <= money) or (cur == "gems" and price <= gems))
            local r = nodeRank2(id)
            if due and afford and (not onlyGems or r == 1) and (r ~= 4 or passN % 3 == 0) then
                list[#list + 1] = { id = id, r = r, price = price, cur = cur }
            end
        end
    end
    table.sort(list, function(a, b) if a.r ~= b.r then return a.r < b.r end return a.price < b.price end)
    local bought = 0
    for i = 1, math.min(maxTries or 3, #list) do
        local n = list[i]
        if buyNode(n.id) then
            bought += 1
            S.ups += 1
            dbg("UPGRADE bought %s (%s %s)", n.id, tostring(n.price), n.cur)
        else
            local m = nodeMemo[n.id] or { fails = 0 }
            nodeMemo[n.id] = m
            m.fails += 1
            local why = tostring(S.lastWhy)
            if why == "LOCKED" then
                m.lockSig = ser(S.state.Upgrades)             -- wait until another upgrade is bought
                m.next = os.clock() + 4
            elseif why == "NOT ENOUGH" then
                m.need = (n.cur == "cash" and money or gems) * 1.25 + 1   -- wait until there is clearly more to spend
                m.needCur = n.cur
                m.next = os.clock() + 4
            else
                m.next = os.clock() + math.min(300, 30 * m.fails)
            end
        end
    end
    return bought
end

-- ══ the shop screen (tools and drones share it): its cash button is called "purchase" ══
local function shopRoot()
    for b in pairs(visibleButtons(pg)) do
        local n = b.Name:lower()
        if n == "purchase" or n == "purchaserbx" then
            return b:FindFirstAncestorWhichIsA("LayerCollector"), b
        end
    end
end
local function shopButtons()
    local root = shopRoot()
    if not root then return nil end
    local buy, close
    for b in pairs(visibleButtons(root)) do
        local n = b.Name:lower()
        if n == "purchase" and textOf(b):find("%$%s*%d") then buy = b
        elseif n == "close" then close = b end
    end
    return buy, close, root
end
local function closeShop()
    for try = 1, 4 do
        local root, anyBtn = shopRoot()
        if not root then return true end
        local close
        for b in pairs(visibleButtons(root)) do
            if b.Name:lower() == "close" then close = b break end
        end
        if close then
            if try == 1 then press(close) else pressHard(close) end
        end
        task.wait(0.3)
        if try == 4 and anyBtn and shopRoot() then
            -- it will not close by its button: put the screen away by hand so it can't cover the game
            local top = anyBtn
            while top.Parent and top.Parent ~= root do top = top.Parent end
            if top:IsA("GuiObject") then
                top.Visible = false
                S.shopHidden = top
                seen.shopStuck = (seen.shopStuck or 0) + 1
                if seen.shopStuck <= 5 then dbg("SHOP: the close button did nothing — hid the shop screen (%s)", top.Name) end
            end
        end
    end
    return shopRoot() == nil
end
-- open a shop page from its stand and wait for the screen
local function openShop(prompt)
    closeShop()
    local t0 = os.clock()
    local fired = 0
    while os.clock() - t0 < 3 do
        if fired == 0 or (fired == 1 and os.clock() - t0 > 1.4) then
            fired += 1
            pcall(function() fireproximityprompt(prompt) end)
        end
        task.wait(0.25)
        if shopRoot() then S.shopHidden = nil return true end
        if S.shopHidden and S.shopHidden.Parent and os.clock() - t0 > 0.6 then
            S.shopHidden.Visible = true          -- we hid it earlier; the game still thinks it is open
        end
    end
    return shopRoot() ~= nil
end

-- ══ tools from the tool shop (Bucket, Shovel, Rake, Vacuum, Chainsaw) ══
local toolNext = 0
local toolPrice = { 75, 5500, 28000, 100000 }      -- Bucket, Shovel, Rake, Vacuum (checked against the shop sign when it has one)
local toolFail = {}
local function signPrice(disp)
    for _, d in ipairs(disp:GetDescendants()) do
        if d:IsA("TextLabel") or d:IsA("TextButton") then
            local num, suf = d.Text:match("%$%s*([%d,%.]+)%s*([KkMmBb]?)")
            if num then
                local v = tonumber((num:gsub(",", "")))
                if v then
                    suf = suf:lower()
                    return v * (suf == "k" and 1e3 or suf == "m" and 1e6 or suf == "b" and 1e9 or 1)
                end
            end
        end
    end
end
local function doTools()
    if os.clock() < toolNext then return end
    local ownedNow = tonumber(S.state.OwnedTools) or 1
    local shop0 = VAULT and VAULT:FindFirstChild("Machines") and VAULT.Machines:FindFirstChild("ToolShop")
    local disp0 = shop0 and shop0:FindFirstChild("Display" .. ownedNow)
    if not disp0 then return end                                    -- every tool is owned
    local price = signPrice(disp0) or toolPrice[ownedNow]
    local money = tonumber(S.state.Money) or 0
    if ownedNow == 5 and not S.saidSawPrice then
        S.saidSawPrice = true
        dbg("CHAINSAW: price %s · money %d", tostring(price), money)
    end
    if price and money < price then return end                      -- can't pay: stay and keep scooping
    if not price and (toolFail[ownedNow] or 0) > os.clock() then return end
    toolNext = os.clock() + 25
    local owned = tonumber(S.state.OwnedTools) or tonumber(lp:GetAttribute("OwnedTools")) or 1
    local shop = VAULT and VAULT:FindFirstChild("Machines") and VAULT.Machines:FindFirstChild("ToolShop")
    local disp = shop and shop:FindFirstChild("Display" .. owned)        -- owned 1 = hands only → Display1 = Bucket
    local prompt = disp and disp:FindFirstChildWhichIsA("ProximityPrompt", true)
    if not prompt then return end
    local where = prompt.Parent:IsA("BasePart") and prompt.Parent.Position or disp:GetPivot().Position
    local hrp = getHRP()
    local back = hrp and hrp.Position
    setState("Checking the tool shop")
    tp(where + Vector3.new(0, 3, -4))
    task.wait(0.25)
    local beforeBtns = visibleButtons(pg)
    S.captureUntil = os.clock() + 2
    openShop(prompt)
    local pressed
    local tW = os.clock()
    while not pressed and os.clock() - tW < 2 do
        task.wait(0.3)
        local pb = shopButtons()
        if pb then
            press(pb) pressed = textOf(pb):sub(1, 40)
            break
        end
        for b in pairs(visibleButtons(pg)) do
            local txt = textOf(b)
            -- the cash button shows "$5,500"; the Robux one shows a bare number and "INSTANT"
            if not beforeBtns[b] and txt:find("%$%s*%d") and safeBuy(txt) then
                press(b) pressed = txt:sub(1, 40)
                break
            end
        end
    end
    task.wait(0.6)
    local now = tonumber(S.state.OwnedTools) or owned
    if pressed then
        local p = pressed:match("%$([%d,]+)")
        if p then toolPrice[owned] = tonumber((p:gsub(",", ""))) end
    end
    if not pressed then
        local t = {}
        for b in pairs(visibleButtons(pg)) do
            if not beforeBtns[b] and #t < 10 then t[#t + 1] = b.Name .. "«" .. textOf(b):sub(1, 30) .. "»" end
        end
        dbg("TOOL shop: new buttons on screen were: %s", #t > 0 and table.concat(t, " · ") or "none")
    end
    dbg("TOOL shop %s: %s · owned %s → %s", prompt.ObjectText, pressed and ("pressed «" .. pressed .. "»") or "no buy button", tostring(owned), tostring(now))
    if now > owned then toolNext = os.clock() + 2
    else
        toolNext = os.clock() + 15
        toolFail[owned] = os.clock() + 60
    end
    pcall(function()
        for b in pairs(visibleButtons(pg)) do
            local l = textOf(b):lower()
            if not beforeBtns[b] and (b.Name:lower():find("close") or l == "x") then press(b) end
        end
    end)
    closeShop()
    if back then tp(back) end
end

-- ══ drones: the DRONES stand next to the tool shop ═════════════════
local droneNext, dronePrice, droneVisits = 0, nil, 0
local function moneyIn(text)
    local num, suf = text:match("%$%s*([%d,%.]+)%s*([KkMmBb]?)")
    if not num then return nil end
    local v = tonumber((num:gsub(",", "")))
    if not v then return nil end
    suf = suf:lower()
    return v * (suf == "k" and 1e3 or suf == "m" and 1e6 or suf == "b" and 1e9 or 1)
end
local function doDrones()
    if os.clock() < droneNext then return end
    if (tonumber(S.state.DroneLevel) or 0) >= 3 or S.droneMax then return end      -- three drones is the most there is
    local money = tonumber(S.state.Money) or 0
    if dronePrice and money < dronePrice then return end           -- can't pay yet: don't walk there
    if not dronePrice and money < 200 then return end
    local stand = VAULT and VAULT:FindFirstChild("Machines") and VAULT.Machines:FindFirstChild("DroneStand")
    local prompt = stand and stand:FindFirstChildWhichIsA("ProximityPrompt", true)
    if not prompt then
        if not S.noDrone then S.noDrone = true dbg("DRONES: no drone stand found") end
        droneNext = os.clock() + 120
        return
    end
    droneNext = os.clock() + 20
    droneVisits += 1
    local where = prompt.Parent:IsA("BasePart") and prompt.Parent.Position or stand:GetPivot().Position
    local hrp = getHRP()
    local back = hrp and hrp.Position
    setState("Buying drones")
    tp(where + Vector3.new(0, 3, -4))
    task.wait(0.25)
    S.captureUntil = os.clock() + 6
    local opened = openShop(prompt)
    local buy = shopButtons()
    local bought, lastPrice = 0, nil
    if opened and not buy then
        -- the page is open but has no cash price on it: nothing left to buy here
        S.droneMax = true
        dbg("DRONES: nothing left to buy at the stand — not going back")
    end
    if not buy then
        local names = {}
        for b in pairs(visibleButtons(pg)) do
            if #names < 16 then names[#names + 1] = b.Name .. "«" .. textOf(b):sub(1, 24) .. "»" end
        end
        if droneVisits <= 6 then dbg("DRONES: the stand's screen did not open · buttons on screen: %s", table.concat(names, " · ")) end
    end
    for _ = 1, 8 do
        buy = shopButtons()
        if not buy then break end
        local txt = textOf(buy)
        local price = moneyIn(txt)
        money = tonumber(S.state.Money) or 0
        if not price then break end
        lastPrice = price
        if price > money then break end
        local m0, d0 = money, ser(S.state.DroneLevel)
        press(buy)
        local tB = os.clock()
        while os.clock() - tB < 1.2 and (tonumber(S.state.Money) or 0) >= m0 and ser(S.state.DroneLevel) == d0 do task.wait(0.1) end
        local m1 = tonumber(S.state.Money) or 0
        local ok = m1 < m0 or ser(S.state.DroneLevel) ~= d0
        if droneVisits <= 20 then dbg("DRONES: pressed «%s» → %s · money %d → %d · drone level %s", txt:sub(1, 30), ok and "bought" or "nothing happened", m0, m1, tostring(S.state.DroneLevel)) end
        if not ok then
            S.droneFails = (S.droneFails or 0) + 1
            droneNext = os.clock() + 60 * S.droneFails
            if S.droneFails >= 3 then S.droneMax = true dbg("DRONES: the game refused three times — treating the drones as maxed") end
            break
        end
        S.droneFails = 0
        bought += 1
        if (tonumber(S.state.DroneLevel) or 0) >= 3 then break end
        task.wait(0.3)
    end
    if lastPrice then dronePrice = lastPrice end
    if not buy and not lastPrice then droneNext = os.clock() + 30 end
    S.drones = (S.drones or 0) + bought
    closeShop()
    S.captureUntil = 0
    if back then tp(back) end
end

-- ══ selling ══════════════════════════════════════════════════════
local function sellSpot()
    local conv = VAULT and VAULT:FindFirstChild("Machines") and VAULT.Machines:FindFirstChild("Conveyor")
    local zone = conv and (conv:FindFirstChild("SellZone") or conv:FindFirstChild("Deposit"))
    return zone, zone and zone.Position or Vector3.new(-33, 0, 46)
end
local function sellNow()
    local zone, at = sellSpot()
    local before = handBills()
    setState("Selling")
    local hrp = getHRP()
    local back = hrp and hrp.Position
    tp(at + Vector3.new(0, 3, 0))
    local t0 = os.clock()
    local how = "standing"
    while os.clock() - t0 < 2.5 and handBills() >= before and before > 0 do task.wait(0.1) end
    if handBills() >= before and before > 0 and zone and firetouchinterest then
        how = "touch"
        pcall(function() firetouchinterest(getHRP(), zone, 0) task.wait(0.05) firetouchinterest(getHRP(), zone, 1) end)
        local t1 = os.clock()
        while os.clock() - t1 < 1.5 and handBills() >= before do task.wait(0.1) end
    end
    if handBills() >= before and before > 0 then
        how = "Return"
        S.captureUntil = os.clock() + 1
        pcall(function() R_Request:FireServer("Return") end)
        local t2 = os.clock()
        while os.clock() - t2 < 1.5 and handBills() >= before do task.wait(0.1) end
    end
    local t3 = os.clock()
    while os.clock() - t3 < 3 and handBills() > 0 do task.wait(0.1) end      -- let the belt take the rest
    S.sales += 1
    seen.sell = (seen.sell or 0) + 1
    if seen.sell <= 12 then dbg("SOLD %d → %d bills (%s) in %.1fs", before, handBills(), how, os.clock() - t0) end
    S.lastSell = os.clock()
    if back then return back end
end

-- ══ picking what to scoop ════════════════════════════════════════
local FLOOR_Y = select(2, sellSpot()).Y
S.dead = {}          -- places where the game stopped answering: { pos, t }
-- height of the solid ground at a spot (nil = nothing to stand on there, i.e. outside the map)
local function groundAt(x, z, fromY)
    if S.noGround then return fromY and (fromY - 10) or FLOOR_Y end       -- floor check unavailable: behave as before
    local y
    pcall(function()
        local rp = RaycastParams.new()
        rp.FilterType = Enum.RaycastFilterType.Exclude
        rp.FilterDescendantsInstances = { lp.Character }
        rp.RespectCanCollide = true
        local hit = workspace:Raycast(Vector3.new(x, fromY or (FLOOR_Y + 12), z), Vector3.new(0, -90, 0), rp)
        if hit then y = hit.Position.Y end
    end)
    return y
end
do
    local _, at = sellSpot()
    if not groundAt(at.X, at.Z) then
        S.noGround = true
        dbg("FLOOR CHECK: could not see the floor even at the sell circle — floor checks switched off")
    end
end
local function skipSpot(p, why)
    S.dead[#S.dead + 1] = { pos = p, t = os.clock() + 90, r2 = 16 }
    if #S.dead > 60 then table.remove(S.dead, 1) end
    seen["skip" .. why] = (seen["skip" .. why] or 0) + 1
    if seen["skip" .. why] <= 6 then dbg("UNSAFE SPOT %s skipped: %s", fmtPos(p), why) end
end
local cache, cacheT, cacheKind = {}, 0, nil
local gemCache, gemT = {}, 0
local VAULT_Z = -112            -- the vault door is at z = -113; everything beyond it is inside the vault
local function targets(kind)
    local now = os.clock()
    if kind == "gems" then
        if now - gemT < 0.4 then return gemCache end
        gemCache, gemT = {}, now
        if not VISUALS then return gemCache end
        local open = S.state.VaultOpen == true
        for _, c in ipairs(VISUALS:GetChildren()) do
            if c.Name == "Diamond" and c:IsA("BasePart") and c.Transparency < 0.95 then
                -- gems behind the vault door can't be reached until the key has opened it
                if open or c.Position.Z > VAULT_Z then gemCache[#gemCache + 1] = c end
            end
        end
        return gemCache
    end
    if now - cacheT < 0.4 then return cache end
    cache, cacheT = {}, now
    if not VISUALS then return cache end
    for i = #S.dead, 1, -1 do if S.dead[i].t < now then table.remove(S.dead, i) end end
    local cells = (not G.off) and G.cells or nil
    local stale = 0
    for _, c in ipairs(VISUALS:GetChildren()) do
        if c.Name == "CashBundle_Body" and c:IsA("BasePart") and c.Transparency < 0.95 and c.Position.Y > FLOOR_Y - 22 then
            local p = c.Position
            local okSpot = true
            for _, z in ipairs(S.dead) do
                local dx, dz = p.X - z.pos.X, p.Z - z.pos.Z
                if dx * dx + dz * dz < (z.r2 or 100) then okSpot = false break end
            end
            if okSpot and cells then
                -- the game's own map says whether cash is really under this bundle
                local col = math.floor(p.X - G.offX + 0.5)
                local row = math.floor(p.Z - G.offZ + 0.5)
                if col < 0 or col >= GW or row < 0 or row >= GH or cells[row * GW + col + 1] <= 0 then
                    okSpot = false
                    stale += 1
                end
            end
            if okSpot then cache[#cache + 1] = c end
        end
    end
    seen.tg = (seen.tg or 0) + 1
    if seen.tg <= 3 or seen.tg % 300 == 0 then dbg("CASH MAP: %d real bundles in sight · %d leftovers ignored · %d empty areas remembered", #cache, stale, #S.dead) end
    return cache
end
local function nearestTo(list, at, maxD)
    local best, bd = nil, maxD or math.huge
    local now = os.clock()
    for _, p in ipairs(list) do
        if p.Parent and (S.bad[p] or 0) < now then
            local d = (p.Position - at).Magnitude
            if d < bd then best, bd = p, d end
        end
    end
    return best, bd
end
local function flatDist(a, b) return math.sqrt((a.X - b.X) ^ 2 + (a.Z - b.Z) ^ 2) end
local function patchRadius(center)
    local r
    pcall(function()
        for _, c in ipairs(VISUALS:GetChildren()) do
            if c:IsA("BasePart") and c.Name:lower():find("patch", 1, true) then
                local dx, dz = c.Position.X - center.X, c.Position.Z - center.Z
                if dx * dx + dz * dz < 64 then
                    local half = math.max(c.Size.X, c.Size.Z) / 2
                    if half >= 4 and half <= 45 then r = half end
                end
            end
        end
    end)
    return r or 13
end
-- gem-boosting upgrades that can still be bought with cash (they should be owned before the key is dug out)
local function gemUpgradesPending()
    local _, nodes = upgradeTree()
    if not nodes or not owns("Start") then return false end
    for _, node in ipairs(nodes:GetChildren()) do
        local hex = node:FindFirstChild("Hex")
        local id = node.Name
        if hex and nodeRank2(id) == 1 and not owns(id) then
            local price, cur = priceOf(textOf(hex))
            local m = nodeMemo[id]
            local locked = m and m.lockSig and m.lockSig == ser(S.state.Upgrades)
            if price and cur == "cash" and not locked then return true, id, price end
        end
    end
    return false
end
-- where the key is, once the game shows it (it is buried under the cash at that spot)
local function keySpot()
    if S.state.HasKey == true or S.state.VaultOpen == true then return nil end
    local part
    local lv = workspace:FindFirstChild("LocalVaultVisuals")
    local vk = lv and lv:FindFirstChild("VaultKey")
    if vk then part = vk:IsA("BasePart") and vk or vk:FindFirstChildWhichIsA("BasePart", true) end
    if not part and S.keyPart and S.keyPart.Parent and S.keyPart ~= S.spark then part = S.keyPart end
    if not part or part.Position.Magnitude < 2 then return nil end
    local pos = part.Position
    if pos.Z < -112 then return nil end                      -- behind the vault door: not reachable
    if not S.keyInfo or flatDist(S.keyInfo.pos, pos) > 3 then
        S.keyInfo = { pos = pos, t = os.clock(), seen = os.clock(), mult = 99, r = 6 }
        dbg("KEY: hidden at %s — it has to be dug out", fmtPos(pos))
    end
    -- gem upgrades first (for up to 4 minutes), as long as one can still be bought
    if os.clock() - S.keyInfo.seen < 240 then
        local pending, id, price = gemUpgradesPending()
        if pending then
            if not S.keyInfo.waitSaid then
                S.keyInfo.waitSaid = true
                dbg("KEY: waiting to dig — %s ($%s) should be bought first", tostring(id), tostring(price))
            end
            return nil
        end
    end
    return pos, part
end
-- returns: centre, radius, true if it is a marked 4X / 10X patch (or the key's spot)
local function richSpot()
    local best, bm, bpart
    for part, info in pairs(S.patches) do
        if not part.Parent or os.clock() - info.t > 180 then S.patches[part] = nil   -- stays a target until the game removes its marker
        elseif info.done then
        elseif not bm or info.mult > bm then best, bm, bpart = part.Position, info.mult, info end
    end
    if best then
        if not bpart.r then
            bpart.r = patchRadius(best) + 1.5
            dbg("PATCH x%s at %s · radius %.1f", tostring(bm), fmtPos(best), bpart.r)
        end
        return best, bpart.r, true, bpart
    end
    local kpos = keySpot()
    if kpos and not (S.keyInfo.done and os.clock() - S.keyInfo.t < 6) then return kpos, S.keyInfo.r, true, S.keyInfo end
    if S.hot and os.clock() < S.hot.untilT then return S.hot.pos, 10, false end
end
-- the square inside the patch that still holds cash and is nearest to the player
local function nearestCellIn(center, R, here)
    local cells = G.cells
    if not cells or G.off then return nil end
    local cc = math.floor(center.X - G.offX + 0.5)
    local cr = math.floor(center.Z - G.offZ + 0.5)
    local rr = math.ceil(R)
    local now = os.clock()
    local best, bd, left = nil, nil, 0
    for rw = math.max(0, cr - rr), math.min(GH - 1, cr + rr) do
        for c = math.max(0, cc - rr), math.min(GW - 1, cc + rr) do
            local idx = rw * GW + c
            if cells[idx + 1] > 0 then
                local x, z = c + G.offX, rw + G.offZ
                if (x - center.X) ^ 2 + (z - center.Z) ^ 2 <= R * R then
                    left += 1
                    local okSpot = (G.bad[idx] or 0) < now
                    if okSpot then
                        for _, zn in ipairs(S.dead) do
                            local dx, dz = x - zn.pos.X, z - zn.pos.Z
                            if dx * dx + dz * dz < (zn.r2 or 100) then okSpot = false break end
                        end
                    end
                    if okSpot then
                        local d = (x - here.X) ^ 2 + (z - here.Z) ^ 2
                        if not bd or d < bd then best, bd = idx, d end
                    end
                end
            end
        end
    end
    if best then return best, best % GW + G.offX, best // GW + G.offZ, left end
    return nil, nil, nil, left
end
local rayP = RaycastParams.new()
pcall(function()
    rayP.FilterType = Enum.RaycastFilterType.Include
    rayP.FilterDescendantsInstances = { VISUALS }
end)
local function surfaceY(x, z)
    local y
    pcall(function()
        local hit = workspace:Raycast(Vector3.new(x, FLOOR_Y + 150, z), Vector3.new(0, -300, 0), rayP)
        if hit and hit.Position.Y > FLOOR_Y - 1 then y = hit.Position.Y end
    end)
    return y or math.max(S.avgY or 0, FLOOR_Y) + 0.3
end
local lastMove = 0
-- returns: position, is-it-a-rich-patch, the bundle part
local function pickTarget(kind)
    local hrp = getHRP()
    local here = hrp and hrp.Position or Vector3.zero
    local list = targets(kind)
    if kind == "gems" then
        local t = nearestTo(list, here)
        if t then return t.Position, false, t end
        return nil
    end
    local rich, R, isPatch, pinfo = richSpot()
    if rich then
        -- every real bundle inside the patch, nearest to me first, until the whole patch is gone
        local best, bd
        local now = os.clock()
        for _, p in ipairs(list) do
            if p.Parent and (S.bad[p] or 0) < now then
                local pos = p.Position
                if (pos.X - rich.X) ^ 2 + (pos.Z - rich.Z) ^ 2 <= R * R then
                    local d = (pos.X - here.X) ^ 2 + (pos.Z - here.Z) ^ 2
                    if not bd or d < bd then best, bd = p, d end
                end
            end
        end
        if best then S.emptySince = nil S.patchAt = nil return best.Position, true, best end
        if isPatch then
            -- nothing drawn inside it right now: the map says which parts of the patch still hold cash
            local idx, x, z, left = nearestCellIn(rich, R, here)
            if idx then
                local spot = Vector3.new(x, here.Y, z)
                if flatDist(spot, here) > 5 then
                    if os.clock() - lastMove > 0.5 then
                        lastMove = os.clock()
                        S.patchAt = os.clock()
                        local g = groundAt(x, z)
                        if not g then
                            skipSpot(Vector3.new(x, FLOOR_Y, z), "no floor in the patch")
                            G.bad[idx] = os.clock() + 120
                            return nil
                        end
                        tp(Vector3.new(x, g + 3, z))
                        cacheT = 0
                        seen.mvR = (seen.mvR or 0) + 1
                        if seen.mvR <= 25 then dbg("PATCH: moved to (%.0f, %.0f) — %d squares of the patch still hold cash", x, z, left) end
                    end
                    return nil
                elseif os.clock() - (S.patchAt or 0) > 1.2 then
                    -- standing on it and nothing shows up: skip this bit of the patch for a while
                    S.dead[#S.dead + 1] = { pos = spot, t = os.clock() + 20, r2 = 25 }
                    S.patchAt = os.clock()
                    cacheT = 0
                    return nil
                else
                    return nil
                end
            end
            if not G.cells or G.off then
                return nil            -- no map right now: wait rather than write the patch off
            end
            if pinfo then pinfo.done = true pinfo.t = os.clock() end
            seen.pdone = (seen.pdone or 0) + 1
            if seen.pdone <= 6 then dbg("PATCH at %s: cleared (%d squares left that can't be reached)", fmtPos(rich), left or 0) end
        end
    end
    local t = nearestTo(list, here, 45)
    if t then S.emptySince = nil return t.Position, false, t end
    -- no cash in sight: the game's own map knows where the rest is
    if G.cells and not G.off then
        if not S.emptySince then S.emptySince = os.clock() end
        if os.clock() - S.emptySince < 0.8 then return nil end           -- give the bundles a moment to appear
        if S.movedTo and flatDist(S.movedTo, here) < 6 then
            S.dead[#S.dead + 1] = { pos = here, t = os.clock() + 60, r2 = 196 }
            if #S.dead > 40 then table.remove(S.dead, 1) end
        end
        local idx, x, z = nearestCell(here, 230)
        local g = idx and groundAt(x, z)
        if idx and not g then
            skipSpot(Vector3.new(x, FLOOR_Y, z), "no floor there")
            G.bad[idx] = os.clock() + 120
        elseif idx then
            S.movedTo = Vector3.new(x, g + 3, z)
            tp(S.movedTo)
            S.emptySince = os.clock()
            cacheT = 0
            seen.mv = (seen.mv or 0) + 1
            if seen.mv <= 25 then dbg("MOVE: no cash in sight at %s → the map says the nearest is at (%.0f, %.0f) · %d empty areas", fmtPos(here), x, z, #S.dead) end
        else
            seen.noCell = (seen.noCell or 0) + 1
            if seen.noCell <= 3 then dbg("MAP: no cash left anywhere it knows of") end
        end
    end
    return nil
end
local REACH = 6
local function face(p)
    local hrp = getHRP()
    if not hrp then return end
    pcall(function()
        local flat = Vector3.new(p.X, hrp.Position.Y, p.Z)
        if (flat - hrp.Position).Magnitude > 0.3 then hrp.CFrame = CFrame.lookAt(hrp.Position, flat) end
        local cam = workspace.CurrentCamera
        if not cam then return end
        local cp = cam.CFrame.Position
        local dx, dz = p.X - cp.X, p.Z - cp.Z
        local h = math.sqrt(dx * dx + dz * dz)
        if h < 0.2 then dx, dz, h = hrp.CFrame.LookVector.X, hrp.CFrame.LookVector.Z, 1 end
        -- the look point is always well below the camera, so it can only ever tilt downwards
        local drop = math.max(cp.Y - p.Y, h * 0.8, 2.5)
        cam.CFrame = CFrame.lookAt(cp, Vector3.new(cp.X + dx, cp.Y - drop, cp.Z + dz))
    end)
end
local function scoop(p, part)
    local isGem = part and part.Name == "Diamond"
    if not isGem and (tonumber(S.state.Capacity) or 0) > 0 and handBills() >= tonumber(S.state.Capacity) then return end
    local hrp = getHRP()
    if not hrp then return end
    if (hrp.Position - p).Magnitude > REACH then
        -- stand just beside the target, on solid ground, looking at it
        local g = groundAt(p.X, p.Z, math.max(p.Y, FLOOR_Y) + 10)
        if not g then
            if part then S.bad[part] = os.clock() + 60 end
            skipSpot(p, "no floor under it")
            cacheT = 0
            return
        end
        if part and part.Name == "CashBundle_Body" and p.Y < g - 4 then
            S.bad[part] = os.clock() + 60          -- a spare bundle parked under the floor, not real cash
            return
        end
        local dir = Vector3.new(hrp.Position.X - p.X, 0, hrp.Position.Z - p.Z)
        dir = (dir.Magnitude > 0.5) and dir.Unit or Vector3.new(0, 0, 1)
        local sx, sz = p.X + dir.X * 3, p.Z + dir.Z * 3
        local g2 = groundAt(sx, sz, math.max(p.Y, FLOOR_Y) + 10)
        if not g2 or math.abs(g2 - g) > 6 then sx, sz, g2 = p.X, p.Z, g end      -- no safe ground beside it: stand right on it
        local stand = Vector3.new(sx, math.max(g2 + 3, p.Y + 1), sz)
        pcall(function()
            hrp.AssemblyLinearVelocity = Vector3.zero
            hrp.CFrame = CFrame.lookAt(stand, Vector3.new(p.X + 0.01, stand.Y, p.Z))
        end)
        S.safe = stand
        S.moves += 1
        task.wait()
    end
    face(p)
    pcall(function() R_Request:FireServer("Collect", p) end)
    S.sent += 1
    if S.miss == 0 then S.missSince = os.clock() end
    S.miss += 1
    if S.miss >= 8 and os.clock() - (S.missSince or os.clock()) > 2.5 then
        -- 2.5 seconds of grabbing here and the game gave nothing: remember the area and go elsewhere
        S.miss = 0
        S.dead[#S.dead + 1] = { pos = p, t = os.clock() + 45, r2 = 100 }
        if #S.dead > 40 then table.remove(S.dead, 1) end
        cacheT = 0
        seen.dead = (seen.dead or 0) + 1
        if seen.dead <= 20 then dbg("EMPTY AREA at %s — moving on (%d remembered)", fmtPos(p), #S.dead) end
    end
    S.lastSentAt = os.clock()
    if part then S.bad[part] = os.clock() + 0.6 end          -- don't hit the same bundle again straight away
    if not part then
        S.gridMiss = (S.gridMiss or 0) + 1
        if S.gridMiss >= 45 then
            -- the map keeps pointing at nothing: use the bundles for a bit and fetch a fresh map
            S.gridMiss = 0
            S.gridPause = os.clock() + 20
            dbg("CASH GRID: 45 grabs with no answer — using the bundles for 20s and re-reading the map")
            task.spawn(loadSnapshot)
        end
    end
end

-- pacing: as fast as the game keeps answering
task.spawn(function()
    local lastSent, lastRep = 0, 0
    while S.alive do
        task.wait(3)
        local ds, dr = S.sent - lastSent, S.replies - lastRep
        lastSent, lastRep = S.sent, S.replies
        if ds >= 8 then
            local ratio = dr / ds
            local old = S.gap
            if ratio < 0.3 then S.gap = math.min(0.2, S.gap * 1.1)
            elseif ratio > 0.8 then S.gap = math.max(0.08, S.gap * 0.92) end
            seen.pace = (seen.pace or 0) + 1
            if seen.pace <= 25 or math.abs(old - S.gap) > 0.05 then
                dbg("PACE sent %d answered %d (%.0f%%) · gap %.2f → %.2f", ds, dr, ratio * 100, old, S.gap)
            end
        end
    end
end)

-- ══ the vault: key, door, gems ═══════════════════════════════════
local function doorPrompt()
    local door = VAULT and VAULT:FindFirstChild("VaultDoor")
    local ip = door and door:FindFirstChild("InteractionPoint")
    return ip and ip:FindFirstChildWhichIsA("ProximityPrompt", true), ip
end
local function keyReady()
    -- the door only opens with the key in hand; until then the job is finding it
    return S.state.HasKey == true and S.state.VaultOpen ~= true
end
local keyPokeT = 0
local function keyPoke()
    local pos, part = keySpot()
    local dug = S.keyInfo and S.keyInfo.done
    -- after 25 tries on a dug-out key, only come back to it every 15 seconds
    local every = (dug and (seen.kpDug or 0) > 25) and 15 or 1.0
    if not pos or os.clock() - keyPokeT < every then return end
    keyPokeT = os.clock()
    local hrp = getHRP()
    if not hrp then return end
    if dug then seen.kpDug = (seen.kpDug or 0) + 1 end
    if dug and (hrp.Position - pos).Magnitude > 7 then
        local g = groundAt(pos.X, pos.Z, math.max(pos.Y, FLOOR_Y) + 10)
        if g then
            pcall(function()
                hrp.AssemblyLinearVelocity = Vector3.zero
                hrp.CFrame = CFrame.new(pos.X, math.max(g + 3, pos.Y + 2), pos.Z)
            end)
            task.wait(0.1)
        end
    end
    if (hrp.Position - pos).Magnitude > 16 then return end
    face(pos)
    pcall(function() R_Request:FireServer("Collect", pos) end)
    pcall(function()
        if firetouchinterest and part:IsA("BasePart") then firetouchinterest(hrp, part, 0) task.wait(0.05) firetouchinterest(hrp, part, 1) end
        local holder = part.Parent ~= workspace and part.Parent or part
        local pr = holder:FindFirstChildWhichIsA("ProximityPrompt", true)
        if pr then fireproximityprompt(pr) end
    end)
    seen.kp = (seen.kp or 0) + 1
    if seen.kp <= 6 or seen.kp % 40 == 0 then dbg("KEY: reaching for it at %s (cash above it %s) · stage %s · has key %s", fmtPos(pos), dug and "gone" or "still there", tostring(S.state.VaultStage), tostring(S.state.HasKey)) end
end
local function doVault()
    setState("Vault — last upgrades first")
    dbg("VAULT: stage %s · key part %s", tostring(S.state.VaultStage), S.keyPart and path(S.keyPart) or "none")
    -- the end-of-game gem upgrades before the key is used
    for _ = 1, 6 do
        if doUpgrades(4, true) == 0 then break end
    end
    dbg("VAULT: key in hand — the game opens the vault by itself; carrying on until it is open")
    S.vaultTried = os.clock() + 1e9          -- once is enough
end
-- go inside the open vault so the diamonds appear
local VAULT_SPOTS = { Vector3.new(8, 0, -134), Vector3.new(0, 0, -142), Vector3.new(-8, 0, -134), Vector3.new(0, 0, -155), Vector3.new(0, 0, -126) }
local vaultSpotI, vaultMoveT = 0, 0
local function enterVault()
    if os.clock() - vaultMoveT < 1.2 then return end
    vaultMoveT = os.clock()
    vaultSpotI = vaultSpotI % #VAULT_SPOTS + 1
    local sp = VAULT_SPOTS[vaultSpotI]
    local hrp = getHRP()
    if not hrp then return end
    local g = groundAt(sp.X, sp.Z, FLOOR_Y + 14)
    if S.noGround or not g then g = FLOOR_Y end
    pcall(function()
        hrp.AssemblyLinearVelocity = Vector3.zero
        hrp.CFrame = CFrame.new(sp.X, g + 3.5, sp.Z)
    end)
    gemT = 0
    seen.vIn = (seen.vIn or 0) + 1
    if seen.vIn <= 8 then dbg("VAULT OPEN: went inside to (%.0f, %.1f, %.0f) to find the diamonds", sp.X, g + 3.5, sp.Z) end
end
local function unusedVaultEnd()
    S.vaultTried = os.clock()
end

-- ══ money bags and safes: hit them until they break ═══════════════
local lootInfo = setmetatable({}, { __mode = "k" })
local function lootTarget()
    local hrp = getHRP()
    local here = hrp and hrp.Position or Vector3.zero
    local best, bpos, bd
    local now = os.clock()
    local function consider(inst)
        local info = lootInfo[inst]
        if not info then info = { hits = 0 } lootInfo[inst] = info end
        if info.dead or (info.skipUntil or 0) > now then return end
        local opened = S.lootOpen and S.lootOpen[inst.Name]
        if opened and now - opened < 25 then return end                 -- just busted: nothing left in it
        local ok, pos = pcall(function()
            local gui = inst:FindFirstChild("LootHealth", true)
            if gui and gui:IsA("BillboardGui") and gui.Adornee and gui.Adornee:IsA("BasePart") then return gui.Adornee.Position end
            return inst:IsA("Model") and inst:GetPivot().Position or inst.Position
        end)
        if ok and pos and pos.Magnitude > 2 and pos.Z > -112 and math.abs(pos.X) < 115 and pos.Z < 70 and pos.Y > FLOOR_Y - 22 then
            local d = (pos - here).Magnitude
            if not bd or d < bd then best, bpos, bd = inst, pos, d end
        end
    end
    pcall(function()
        local folder = VAULT and VAULT:FindFirstChild("Resources") and VAULT.Resources:FindFirstChild("Loot")
        if folder then
            for _, c in ipairs(folder:GetChildren()) do
                if (c:IsA("Model") or c:IsA("BasePart")) and (c:FindFirstChild("LootHighlight", true) or c:FindFirstChild("LootHealth", true)) then
                    consider(c)
                end
            end
        end
    end)
    if S.loot then
        for inst in pairs(S.loot) do
            if not inst.Parent then S.loot[inst] = nil
            elseif not (inst.Parent and inst.Parent.Name == "Loot") then pcall(consider, inst) end
        end
    end
    return best, bpos
end
local function hitLoot(inst, pos)
    local info = lootInfo[inst]
    local hrp = getHRP()
    if not info or not hrp then return end
    local now = os.clock()
    if not info.first then
        info.first = now
        info.hits = 0
        dbg("LOOT: going for %s at %s", inst.Name, fmtPos(pos))
    end
    local lastHit = S.lootHitT and S.lootHitT[inst.Name] or 0
    -- the game confirms every hit; if it has confirmed nothing for 5 seconds, this one can't be hit
    if now - info.first > 5 and now - lastHit > 5 then
        info.gaveUp = (info.gaveUp or 0) + 1
        info.skipUntil = now + 60
        info.first = nil
        dbg("LOOT: %s at %s — the game counted no hits (%d tries) · leaving it for a minute", inst.Name, fmtPos(pos), info.hits)
        if info.gaveUp >= 3 then info.dead = true end
        return
    end
    if (hrp.Position - pos).Magnitude > REACH then
        local g = groundAt(pos.X, pos.Z, math.max(pos.Y, FLOOR_Y) + 10)
        if not g then info.skipUntil = now + 60 info.first = nil return end
        local stand = Vector3.new(pos.X + 2.5, math.max(g + 3, pos.Y + 1), pos.Z)
        pcall(function()
            hrp.AssemblyLinearVelocity = Vector3.zero
            hrp.CFrame = CFrame.lookAt(stand, Vector3.new(pos.X, stand.Y, pos.Z))
        end)
        task.wait()
    end
    face(pos)
    pcall(function() R_Request:FireServer("Collect", pos) end)
    info.hits += 1
end

-- ══ safety net: if the character ever drops below the map, bring it straight back ══
task.spawn(function()
    while S.alive do
        task.wait(0.25)
        if cfg.farm then
            pcall(function()
                local hrp = getHRP()
                if hrp and hrp.Position.Y < FLOOR_Y - 45 then
                    local fellTo = hrp.Position.Y
                    local _, at = sellSpot()
                    local to = (S.safe and groundAt(S.safe.X, S.safe.Z)) and S.safe or (at + Vector3.new(0, 4, 0))
                    hrp.AssemblyLinearVelocity = Vector3.zero
                    hrp.CFrame = CFrame.new(to)
                    seen.rescue = (seen.rescue or 0) + 1
                    if seen.rescue <= 10 then dbg("RESCUE: fell to y=%.0f — put back at %s", fellTo, fmtPos(to)) end
                end
            end)
        end
    end
end)

-- ══ main loop ════════════════════════════════════════════════════
local lastUp = 0
task.spawn(function()
    task.wait(1)
    while S.alive do
        if not cfg.farm then task.wait(0.3) continue end
        local ok, err = pcall(function()
            -- the run is over: nothing more to do in this game
            if lp:GetAttribute("DiamondDone") == true or lp:GetAttribute("RunFinished") == true or S.state.SessionComplete == true then
                if not S.saidDone then
                    S.saidDone = true
                    dbg("RUN FINISHED · diamonds this run %s · time %s", tostring(lp:GetAttribute("RunDiamonds")), tostring(lp:GetAttribute("RunTime")))
                end
                setState("Run finished")
                if cfg.autojoin and not S.endT then S.endT = os.clock() end
                if cfg.autojoin and S.endT and os.clock() - S.endT > 6 and os.clock() - (S.lobbyTry or 0) > 15 then
                    S.lobbyTry = os.clock()
                    dbg("RUN FINISHED → back to the lobby for the next game")
                    pcall(function() writefile("shred_overnight.txt", tostring(os.time())) end)    -- a finished game keeps overnight farm going
                    pcall(function() writefile("shred_end_log.txt", report()) end)
                    setState("Going to the lobby")
                    local ok, e = pcall(function() game:GetService("TeleportService"):Teleport(70567592362925, lp) end)
                    if not ok then dbg("LOBBY TELEPORT failed: %s", tostring(e)) end
                end
                S.endSeen = S.endSeen or {}
                pcall(function()
                    local guis = {}
                    for _, g in ipairs(pg:GetChildren()) do if g:IsA("LayerCollector") and g.Enabled then guis[#guis + 1] = g.Name end end
                    local sig = table.concat(guis, ",")
                    if sig ~= S.endGuis then S.endGuis = sig dbg("END · screens on: %s", sig) end
                    for b in pairs(visibleButtons(pg)) do
                        local key = path(b) .. "|" .. textOf(b)
                        if not S.endSeen[key] and not key:find("ShredAuto", 1, true) then
                            S.endSeen[key] = true
                            dbg("END BUTTON %s «%s» at %d,%d size %dx%d", path(b), textOf(b):sub(1, 60), b.AbsolutePosition.X, b.AbsolutePosition.Y, b.AbsoluteSize.X, b.AbsoluteSize.Y)
                            pcall(function() table.insert(CONNS, b.Activated:Connect(function() dbg("YOU PRESSED %s «%s»", path(b), textOf(b):sub(1, 60)) end)) end)
                        end
                    end
                end)
                task.wait(1)
                return
            end
            -- the vault is open: straight inside, diamonds only, until the 60 seconds are up
            if S.state.VaultOpen == true then
                local t, _, part = pickTarget("gems")
                if t then
                    setState("Vault open — grabbing diamonds")
                    scoop(t, part)
                    task.wait(math.max(0.06, S.gap * 0.8))
                else
                    setState("Vault open — going in")
                    enterVault()
                    task.wait(0.25)
                end
                return
            end
            -- 1) gems on the floor: grab them as fast as possible
            if #targets("gems") > 0 then
                setState("Gems! collecting")
                local t, _, part = pickTarget("gems")
                if t then scoop(t, part) end
                task.wait(math.max(0.06, S.gap * 0.8))
                return
            end
            -- 2) the vault is ready
            if cfg.vault and keyReady() and os.clock() - (S.vaultTried or 0) > 8 then
                doVault()
                return
            end
            -- 3) full bag → shred it
            local hb, cap = handBills(), bagCap()
            if cfg.sell and hb > 0 and cap and hb >= cap then
                local back = sellNow()
                local _, _, onPatch = richSpot()
                if cfg.upgrade and not onPatch then doDrones() doTools() doUpgrades(3) end
                if back then tp(back) end
                S.lastReply = os.clock()
                return
            end
            -- nothing answered for a while with an empty bag: say so and move somewhere else
            if S.lastSentAt and os.clock() - S.lastReply > 8 and hb == 0 then
                seen.quiet = (seen.quiet or 0) + 1
                if seen.quiet <= 10 then dbg("QUIET: no answers for %.0fs · sent %d · %s", os.clock() - S.lastReply, S.sent, tostring(S.state.VaultStage)) end
                S.lastReply = os.clock()
            end
            -- money bags / safes first: keep hitting until they break
            local lootInst, lootPos = lootTarget()
            if lootInst then
                setState("Breaking a money bag")
                hitLoot(lootInst, lootPos)
                task.wait(math.max(0.1, S.gap))
                return
            end
            keyPoke()
            -- 4) upgrades now and then
            if cfg.upgrade and os.clock() - lastUp > 6 and not select(3, richSpot()) then
                lastUp = os.clock()
                doUpgrades(2)
            end
            -- 5) scoop (rich patches first)
            local t, rich, part = pickTarget("cash")
            if t then
                setState(rich and "Scooping a rich patch" or "Scooping")
                scoop(t, part)
            else
                setState("Looking for cash")
                task.wait(0.2)
            end
            task.wait(S.gap)
        end)
        if not ok then
            seen.err = (seen.err or 0) + 1
            if seen.err <= 10 then dbg("LOOP ERROR %s", tostring(err)) end
            task.wait(0.5)
        end
    end
end)

-- panel numbers
task.spawn(function()
    while S.alive do
        task.wait(0.5)
        pcall(function()
            local cap = bagCap()
            rows.Bag.Text = string.format("%d%s bills · gap %.2fs", handBills(), cap and (" / " .. cap) or "", S.gap)
            rows.Run.Text = string.format("%d sales · %d upgrades · %d grabs", S.sales, S.ups, S.replies)
            local rem = tonumber(S.state.VaultRemaining)
            rows.Vault.Text = string.format("%s · %s left", tostring(S.state.VaultStage or "?"),
                rem and (rem >= 1e6 and string.format("%.2fM", rem / 1e6) or string.format("%dk", math.floor(rem / 1000))) or "?")
            setSub(string.format("$%s shredded this run · %d gems", tostring(S.cash), S.gems))
        end)
    end
end)

task.spawn(function()
    while S.alive do
        pcall(loadSnapshot)
        task.wait(40)
    end
end)
pcall(function()
    table.insert(CONNS, lp.OnTeleport:Connect(function(state, placeId)
        dbg("TELEPORT %s → place %s", tostring(state), tostring(placeId))
        pcall(function() writefile(S.saidDone and "shred_end_log.txt" or "shred_auto_log.txt", report()) end)
    end))
end)
dbg("auto-started %s · run-again queue: %s", tostring(SHRED_AUTOBOOT), SHRED_QUEUE_STATE)
dbg("v17 loaded · recorder %s · bag cap %s", tostring(_G.ShredAutoHooked), tostring(bagCap()))
