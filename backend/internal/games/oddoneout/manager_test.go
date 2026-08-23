package oddoneout

import "testing"

func TestManagerStats(t *testing.T) {
	manager := NewManager(nil, nil)
	t.Cleanup(manager.Close)
	room, host, err := manager.Create(testRoomParams())
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if _, err := room.Join("Bob", "secret"); err != nil {
		t.Fatalf("Join() error = %v", err)
	}
	if err := room.SetConnected(host.PlayerID, true); err != nil {
		t.Fatalf("SetConnected() error = %v", err)
	}

	stats := manager.Stats()
	if stats.RoomsTotal != 1 || stats.RoomsActive != 1 || stats.RoomsFinished != 0 {
		t.Fatalf("room stats = %+v", stats)
	}
	if stats.RoomsByPhase[PhaseLobby] != 1 || stats.PlayersTotal != 2 || stats.PlayersConnected != 1 {
		t.Fatalf("lobby stats = %+v", stats)
	}

	if err := room.Stop(host.PlayerID); err != nil {
		t.Fatalf("Stop() error = %v", err)
	}
	stats = manager.Stats()
	if stats.RoomsActive != 0 || stats.RoomsFinished != 1 || stats.RoomsByPhase[PhaseFinished] != 1 {
		t.Fatalf("finished stats = %+v", stats)
	}
}

func TestSearchJoinableRanksPrefixesAndExcludesUnavailableRooms(t *testing.T) {
	manager := NewManager(nil, nil)
	t.Cleanup(manager.Close)
	create := func(id, name string, limit int) (*Room, Credentials) {
		params := testRoomParams()
		params.ID, params.Name, params.Settings.PlayerLimit = id, name, limit
		room, host, err := manager.Create(params)
		if err != nil {
			t.Fatalf("Create(%q) error = %v", name, err)
		}
		return room, host
	}
	create("room_middle", "Our Friday Club", 6)
	create("room_prefix", "Friday Friends", 6)
	full, _ := create("room_full", "Friday Full", 3)
	if _, err := full.Join("Bob", "secret"); err != nil {
		t.Fatal(err)
	}
	if _, err := full.Join("Chandra", "secret"); err != nil {
		t.Fatal(err)
	}
	finished, host := create("room_finished", "Friday Finished", 6)
	if err := finished.Stop(host.PlayerID); err != nil {
		t.Fatal(err)
	}

	matches := manager.SearchJoinable("fri", 10)
	if len(matches) != 2 || matches[0].Name != "Friday Friends" || matches[1].Name != "Our Friday Club" {
		t.Fatalf("matches = %+v", matches)
	}
	if !matches[0].Protected || !matches[1].Protected {
		t.Fatalf("protected metadata missing: %+v", matches)
	}
}
