package oddoneout

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/ak/skewa/backend/internal/identifier"
	"github.com/ak/skewa/backend/internal/snapshot"
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
