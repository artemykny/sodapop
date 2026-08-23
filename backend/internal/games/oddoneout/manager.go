package oddoneout

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/ak/sodapop/backend/internal/identifier"
	"github.com/ak/sodapop/backend/internal/snapshot"
)

var ErrRoomNotFound = errors.New("room not found")

type Manager struct {
	mu          sync.RWMutex
	rooms       map[string]*Room
	roomNames   map[string]string
	subscribers map[string]map[chan struct{}]struct{}
	store       snapshot.Store
	logger      *slog.Logger
	ctx         context.Context
	cancel      context.CancelFunc
}

func NewManager(store snapshot.Store, logger *slog.Logger) *Manager {
	if logger == nil {
		logger = slog.Default()
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &Manager{
		rooms: make(map[string]*Room), roomNames: make(map[string]string),
		subscribers: make(map[string]map[chan struct{}]struct{}),
		store:       store, logger: logger, ctx: ctx, cancel: cancel,
	}
}

func (m *Manager) Create(params CreateRoomParams) (*Room, Credentials, error) {
	if params.ID == "" {
		roomID, err := identifier.New("room_", 12)
		if err != nil {
			return nil, Credentials{}, err
		}
		params.ID = roomID
	}
	room, credentials, err := NewRoom(params)
	if err != nil {
		return nil, Credentials{}, err
	}

	nameKey := strings.ToLower(room.NameValue())
	m.mu.Lock()
	if _, exists := m.rooms[room.IDValue()]; exists {
		m.mu.Unlock()
		return nil, Credentials{}, errors.New("room id is already in use")
	}
	if _, exists := m.roomNames[nameKey]; exists {
		m.mu.Unlock()
		return nil, Credentials{}, errors.New("room name is already in use")
	}
	m.rooms[room.IDValue()] = room
	m.roomNames[nameKey] = room.IDValue()
	m.mu.Unlock()

	go m.watch(room)
	m.persist(room)
	m.publish(room.IDValue())
	return room, credentials, nil
}

func (m *Manager) Get(roomID string) (*Room, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	room, ok := m.rooms[roomID]
	if !ok {
		return nil, ErrRoomNotFound
	}
	return room, nil
}

func (m *Manager) FindByName(name string) (*Room, error) {
	m.mu.RLock()
	roomID, ok := m.roomNames[strings.ToLower(strings.TrimSpace(name))]
	room := m.rooms[roomID]
	m.mu.RUnlock()
	if !ok || room == nil {
		return nil, ErrRoomNotFound
	}
	return room, nil
}

func (m *Manager) Subscribe(roomID string) (<-chan struct{}, func(), error) {
	if _, err := m.Get(roomID); err != nil {
		return nil, nil, err
	}
	updates := make(chan struct{}, 1)
	m.mu.Lock()
	if m.subscribers[roomID] == nil {
		m.subscribers[roomID] = make(map[chan struct{}]struct{})
	}
	m.subscribers[roomID][updates] = struct{}{}
	m.mu.Unlock()
	updates <- struct{}{}

	var once sync.Once
	unsubscribe := func() {
		once.Do(func() {
			m.mu.Lock()
			delete(m.subscribers[roomID], updates)
			m.mu.Unlock()
		})
	}
	return updates, unsubscribe, nil
}

func (m *Manager) Close() {
	m.cancel()
}

func (m *Manager) watch(room *Room) {
	for {
		select {
		case <-m.ctx.Done():
			return
		case <-room.Changes():
			m.publish(room.IDValue())
			m.persist(room)
		}
	}
}

func (m *Manager) publish(roomID string) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for subscriber := range m.subscribers[roomID] {
		select {
		case subscriber <- struct{}{}:
		default:
		}
	}
}

func (m *Manager) persist(room *Room) {
	if m.store == nil {
		return
	}
	snapshot, err := room.Snapshot()
	if err != nil {
		m.logger.Error("create room snapshot", "room_id", room.IDValue(), "error", err)
		return
	}
	ctx, cancel := context.WithTimeout(m.ctx, 5*time.Second)
	defer cancel()
	if err := m.store.Save(ctx, snapshot); err != nil && !errors.Is(err, context.Canceled) {
		m.logger.Error("save room snapshot", "room_id", room.IDValue(), "version", snapshot.Version, "error", err)
	}
}

func (m *Manager) DebugString() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return fmt.Sprintf("rooms=%d subscribers=%d", len(m.rooms), len(m.subscribers))
}

type Stats struct {
	RoomsTotal       int
	RoomsActive      int
	RoomsFinished    int
	RoomsByPhase     map[Phase]int
	PlayersTotal     int
	PlayersConnected int
}

func (m *Manager) Stats() Stats {
	m.mu.RLock()
	rooms := make([]*Room, 0, len(m.rooms))
	for _, room := range m.rooms {
		rooms = append(rooms, room)
	}
	m.mu.RUnlock()

	stats := Stats{RoomsTotal: len(rooms), RoomsByPhase: make(map[Phase]int)}
	for _, room := range rooms {
		room.mu.RLock()
		stats.RoomsByPhase[room.Phase]++
		if room.Phase == PhaseFinished {
			stats.RoomsFinished++
		} else {
			stats.RoomsActive++
		}
		stats.PlayersTotal += len(room.Players)
		for _, player := range room.Players {
			if player.Connected {
				stats.PlayersConnected++
			}
		}
		room.mu.RUnlock()
	}
	return stats
}

type JoinableRoom struct {
	Name string
}

func (m *Manager) SearchJoinable(query string, limit int) []JoinableRoom {
	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" || limit <= 0 {
		return []JoinableRoom{}
	}
	m.mu.RLock()
	rooms := make([]*Room, 0, len(m.rooms))
	for _, room := range m.rooms {
		rooms = append(rooms, room)
	}
	m.mu.RUnlock()

	matches := make([]JoinableRoom, 0)
	for _, room := range rooms {
		room.mu.RLock()
		name := room.Name
		joinable := room.Phase == PhaseLobby && len(room.Players) < room.Settings.PlayerLimit
		room.mu.RUnlock()
		if joinable && strings.Contains(strings.ToLower(name), query) {
			matches = append(matches, JoinableRoom{Name: name})
		}
	}
	sort.Slice(matches, func(i, j int) bool {
		iPrefix := strings.HasPrefix(strings.ToLower(matches[i].Name), query)
		jPrefix := strings.HasPrefix(strings.ToLower(matches[j].Name), query)
		if iPrefix != jPrefix {
			return iPrefix
		}
		return strings.ToLower(matches[i].Name) < strings.ToLower(matches[j].Name)
	})
	if len(matches) > limit {
		matches = matches[:limit]
	}
	return matches
}
